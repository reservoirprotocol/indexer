import { Interface } from "@ethersproject/abi";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { getStatus, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";

const STANDARD = "soundxyz";

export type Info = {
  minter?: string;
  mintId?: string;
};

export enum InterfaceId {
  RangeEditionMinterV2_1 = "0xb9f19d17",
  MerkleDropMinterV2_1 = "0x6328e9ad",
}

export const extractByCollection = async (
  collection: string,
  mintId: string,
  minterAddress: string
): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const contract = new Contract(
    minterAddress,
    new Interface([`function moduleInterfaceId() external pure returns (bytes4)`]),
    baseProvider
  );

  let moduleInterfaceId: string | undefined;
  try {
    moduleInterfaceId = await contract.moduleInterfaceId();
  } catch {
    // Skip errors
  }

  try {
    if (moduleInterfaceId === InterfaceId.RangeEditionMinterV2_1) {
      const minter = new Contract(
        minterAddress,
        new Interface([
          `function totalPriceAndFees(
            address edition,
            uint128 mintId,
            uint32 quantity
          ) view returns (
            uint256 total,
            uint256 subTotal,
            uint256 platformFlatFeeTotal,
            uint256 platformFee,
            uint256 affiliateFee
          )`,
          `function mintInfo(address collection, uint128 mintId) view returns (
            (
              uint32 startTime,
              uint32 endTime,
              uint16 affiliateFeeBPS,
              bool mintPaused,
              uint96 price,
              uint32 maxMintableUpper,
              uint32 maxMintableLower,
              uint32 maxMintablePerAccount,
              uint32 totalMinted,
              uint32 cutoffTime,
              bytes32 affiliateMerkleRoot,
              uint16 platformFeeBPS,
              uint96 platformFlatFee,
              uint96 platformPerTxFlatFee
            ) info
          )`,
        ]),
        baseProvider
      );

      const mintInfo = await minter.mintInfo(collection, mintId);
      const totalPrice = await minter.totalPriceAndFees(collection, mintId, 1);

      // Public sale
      if (!mintInfo.mintPaused) {
        // Include the Manifold mint fee into the price
        const price = totalPrice.total.toString();

        return [
          {
            collection,
            contract: collection,
            stage: `claim-${minterAddress.toLowerCase()}-${mintId}`,
            kind: "public",
            status: "open",
            standard: STANDARD,
            details: {
              tx: {
                to: minterAddress.toLowerCase(),
                data: {
                  // `mint`
                  signature: "0xb3b34f99",
                  params: [
                    {
                      kind: "contract",
                      abiType: "address",
                    },
                    {
                      kind: "unknown",
                      abiType: "uint256",
                      abiValue: mintId,
                    },
                    {
                      kind: "quantity",
                      abiType: "uint16",
                    },
                    {
                      kind: "referrer",
                      abiType: "address",
                    },
                  ],
                },
              },
              info: {
                minter: minterAddress.toLowerCase(),
                mintId,
              },
            },
            currency: Sdk.Common.Addresses.Native[config.chainId],
            price,
            maxMintsPerWallet: mintInfo.maxMintablePerAccount,
            maxSupply: mintInfo.maxMintableUpper,
            startTime: toSafeTimestamp(mintInfo.startTime),
            endTime: toSafeTimestamp(mintInfo.cutoffTime),
          },
        ];
      }
    }

    if (moduleInterfaceId === InterfaceId.MerkleDropMinterV2_1) {
      const minter = new Contract(
        minterAddress,
        new Interface([
          `function totalPriceAndFees(
            address edition,
            uint128 mintId,
            uint32 quantity
          ) view returns (
            uint256 total,
            uint256 subTotal,
            uint256 platformFlatFeeTotal,
            uint256 platformFee,
            uint256 affiliateFee
          )`,
          `function mintInfo(address collection, uint128 mintId) view returns (
            (
              uint32 startTime,
              uint32 endTime,
              uint16 affiliateFeeBPS,
              bool mintPaused,
              uint96 price,
              uint32 maxMintable,
              uint32 maxMintablePerAccount,
              uint32 totalMinted,
              bytes32 merkleRootHash,
              bytes32 affiliateMerkleRoot,
              uint16 platformFeeBPS,
              uint96 platformFlatFee,
              uint96 platformPerTxFlatFee
            ) info
          )`,
        ]),
        baseProvider
      );

      const mintInfo = await minter.mintInfo(collection, mintId);
      const totalPrice = await minter.totalPriceAndFees(collection, mintId, 1);

      // Allowlist sale
      if (mintInfo.merkleRootHash !== HashZero && !mintInfo.mintPaused) {
        // Include the Manifold mint fee into the price
        const price = totalPrice.total.toString();

        return [
          {
            collection,
            contract: collection,
            stage: `claim-${minterAddress.toLowerCase()}-${mintId}`,
            kind: "allowlist",
            status: "open",
            standard: STANDARD,
            details: {
              tx: {
                to: minterAddress.toLowerCase(),
                data: {
                  // `mint`
                  signature: "0x159a76bd",
                  params: [
                    {
                      kind: "contract",
                      abiType: "address",
                    },
                    {
                      kind: "unknown",
                      abiType: "uint256",
                      abiValue: mintId,
                    },
                    {
                      kind: "quantity",
                      abiType: "uint16",
                    },
                    {
                      kind: "allowlist",
                      abiType: "bytes32[]",
                    },
                    {
                      kind: "referrer",
                      abiType: "address",
                    },
                  ],
                },
              },
              info: {
                minter: minterAddress.toLowerCase(),
                mintId,
              },
            },
            currency: Sdk.Common.Addresses.Native[config.chainId],
            price,
            maxMintsPerWallet: mintInfo.maxMintablePerAccount,
            maxSupply: mintInfo.maxMintable,
            startTime: toSafeTimestamp(mintInfo.startTime),
            endTime: toSafeTimestamp(mintInfo.cutoffTime),
            allowlistId: mintInfo.merkleRoot,
          },
        ];
      }
    }
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
  }

  // Update the status of each collection mint
  await Promise.all(
    results.map(async (cm) => {
      await getStatus(cm).then(({ status, reason }) => {
        cm.status = status;
        cm.statusReason = reason;
      });
    })
  );

  return results;
};

export const extractByTx = async (
  collection: string,
  tx: Transaction
): Promise<CollectionMint[]> => {
  if (
    [
      "0xb3b34f99", // `RangeEditionMinterV2_1.mint`
      "0xc90974d0", // `RangeEditionMinterV2_1.mintTo`
      "0x159a76bd", // `MerkleDropMinterV2_1.mint`
      "0xb24e737e", // `MerkleDropMinterV2_1.mintTo`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    try {
      const parsed = new Interface([
        "function mint(address edition, uint128 mintId, uint32 quantity, address affiliate)",
        "function mint(address edition, uint128 mintId, uint32 quantity, bytes32[] proof, address affiliate)",
        "function mintTo(address edition, uint128 mintId, address to, uint32 quantity, address affiliate, bytes32[] affiliateProof, uint256 attributionId)",
        "function mintTo(address edition, uint128 mintId, address to, uint32 quantity, address allowlisted, bytes32[] proof, address affiliate, bytes32[] affiliateProof, uint256 attributionId)",
      ]).parseTransaction({
        data: tx.data,
      });

      const mintId = parsed.args.mintId.toString();
      return extractByCollection(collection, mintId, tx.to);
    } catch {
      // Skip errors
    }
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  for (const { details } of existingCollectionMints) {
    // Fetch and save/update the currently available mints
    const latestCollectionMints = await extractByCollection(
      collection,
      (details.info! as Info).mintId!,
      (details.info! as Info).minter!
    );
    for (const collectionMint of latestCollectionMints) {
      await simulateAndUpsertCollectionMint(collectionMint);
    }

    // Assume anything that exists in our system but was not returned
    // in the above call is not available anymore so we can close
    for (const existing of existingCollectionMints) {
      if (
        !latestCollectionMints.find(
          (latest) => latest.collection === existing.collection && latest.stage === existing.stage
        )
      ) {
        await simulateAndUpsertCollectionMint({
          ...existing,
          status: "closed",
        });
      }
    }
  }
};

type ProofValue = string[];

export const generateProofValue = async (
  collectionMint: CollectionMint,
  address: string
): Promise<ProofValue> => {
  const cacheKey = `${collectionMint.collection}-${collectionMint.stage}-${collectionMint.tokenId}-${address}`;
  let result: ProofValue = await redis
    .get(cacheKey)
    .then((response) => (response ? JSON.parse(response) : undefined));
  if (!result) {
    result = await axios
      .get(
        `https://lanyard.org/api/v1/proof?unhashedLeaf=${address}&root=${collectionMint.allowlistId}`
      )
      .then(({ data }) => data.proof);

    if (result) {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 3600);
    }
  }

  return result;
};
