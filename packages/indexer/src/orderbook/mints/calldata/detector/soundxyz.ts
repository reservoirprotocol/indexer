import { Interface } from "@ethersproject/abi";
import { AddressZero, HashZero } from "@ethersproject/constants";
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
import { getStatus, toSafeNumber, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";

const STANDARD = "soundxyz";

export type Info = {
  minter?: string;
  mintId?: string;
  // Relevant for `SuperMinter` mints
  scheduleNum?: string;
};

export enum InterfaceId {
  RangeEditionMinterV2_1 = "0xb9f19d17",
  MerkleDropMinterV2_1 = "0x6328e9ad",
  SAM = "0xa3c2dbc7",
}

export const extractByCollection = async (
  collection: string,
  minterAddress: string,
  mintId?: string,
  scheduleNum?: string
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
    // Using `SuperMinter`
    if (scheduleNum && !moduleInterfaceId) {
      const minter = new Contract(
        minterAddress,
        new Interface([
          `function totalPriceAndFees(
            address edition,
            uint8 tier,
            uint8 scheduleNum,
            uint32 quantity
          ) view returns (
            (
              uint256 total,
              uint256 subTotal,
              uint256 unitPrice,
              uint256 platformFee,
              uint256 platformFlatFee,
              uint256 platformTxFlatFee,
              uint256 platformMintFlatFee,
              uint256 platformMintBPSFee,
              uint256 affiliateFee
            ) fee
          )`,
          `function mintInfo(
            address edition,
            uint8 tier,
            uint8 scheduleNum
          ) view returns (
            (
              address edition,
              uint8 tier,
              uint8 scheduleNum,
              address platform,
              uint96 price,
              uint32 startTime,
              uint32 endTime,
              uint32 maxMintablePerAccount,
              uint32 maxMintable,
              uint32 minted,
              uint16 affiliateFeeBPS,
              uint8 mode,
              bool paused,
              bool hasMints,
              bytes32 affiliateMerkleRoot,
              bytes32 merkleRoot,
              address signer,
              bool usePlatformSigner
            ) info
          )`,
        ]),
        baseProvider
      );

      const mintInfo = await minter.mintInfo(collection, mintId, scheduleNum);
      const totalPrice = await minter.totalPriceAndFees(collection, mintId, scheduleNum, 1);

      // Public sale
      if (!mintInfo.paused) {
        const price = totalPrice.total.toString();

        results.push({
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
                // `mintTo`
                signature: "0x4a04a1c9",
                params: [
                  {
                    kind: "tuple",
                    params: [
                      {
                        kind: "contract",
                        abiType: "address",
                      },
                      {
                        kind: "unknown",
                        abiType: "uint8",
                        abiValue: mintId,
                      },
                      {
                        kind: "unknown",
                        abiType: "uint8",
                        abiValue: scheduleNum,
                      },
                      {
                        kind: "recipient",
                        abiType: "address",
                      },
                      {
                        kind: "quantity",
                        abiType: "uint32",
                      },
                      {
                        kind: "unknown",
                        abiType: "address",
                        abiValue: AddressZero,
                      },
                      {
                        kind: "unknown",
                        abiType: "uint32",
                        abiValue: 0,
                      },
                      {
                        kind: "unknown",
                        abiType: "bytes3[]",
                        abiValue: [],
                      },
                      {
                        kind: "unknown",
                        abiType: "uint96",
                        abiValue: 0,
                      },
                      {
                        kind: "unknown",
                        abiType: "uint32",
                        abiValue: 0,
                      },
                      {
                        kind: "unknown",
                        abiType: "uint32",
                        abiValue: 0,
                      },
                      {
                        kind: "unknown",
                        abiType: "uint32",
                        abiValue: 0,
                      },
                      {
                        kind: "unknown",
                        abiType: "bytes",
                        abiValue: AddressZero,
                      },
                      {
                        kind: "referrer",
                        abiType: "address",
                      },
                      {
                        kind: "unknown",
                        abiType: "bytes3[]",
                        abiValue: [],
                      },
                      {
                        kind: "unknown",
                        abiType: "uint256",
                        abiValue: 0,
                      },
                    ],
                  },
                ],
              },
            },
            info: {
              minter: minterAddress.toLowerCase(),
              mintId,
              scheduleNum,
            },
          },
          currency: Sdk.Common.Addresses.Native[config.chainId],
          price,
          maxMintsPerWallet: toSafeNumber(mintInfo.maxMintablePerAccount),
          maxSupply: toSafeNumber(mintInfo.maxMintable),
          startTime: toSafeTimestamp(mintInfo.startTime),
          endTime: toSafeTimestamp(mintInfo.endTime),
        });
      }
    }

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
        // Include the mint fee into the price
        const price = totalPrice.total.toString();

        results.push({
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
          maxMintsPerWallet: toSafeNumber(mintInfo.maxMintablePerAccount),
          maxSupply: toSafeNumber(mintInfo.maxMintableUpper),
          startTime: toSafeTimestamp(mintInfo.startTime),
          endTime: toSafeTimestamp(mintInfo.cutoffTime),
        });
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
        // Include the mint fee into the price
        const price = totalPrice.total.toString();

        results.push({
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
          maxMintsPerWallet: toSafeNumber(mintInfo.maxMintablePerAccount),
          maxSupply: toSafeNumber(mintInfo.maxMintable),
          startTime: toSafeTimestamp(mintInfo.startTime),
          endTime: toSafeTimestamp(mintInfo.cutoffTime),
          allowlistId: mintInfo.merkleRoot,
        });
      }
    }

    if (moduleInterfaceId === InterfaceId.SAM) {
      const minter = new Contract(
        minterAddress,
        new Interface([
          `function totalBuyPriceAndFees(
            address edition,
            uint32 supplyForwardOffset,
            uint32 quantity
          ) view returns (
            uint256 total,
            uint256 platformFee,
            uint256 artistFee,
            uint256 goldenEggFee,
            uint256 affiliateFee
          )`,
          `function samInfo(address edition) view returns (
            (
              uint96 basePrice,
              uint128 linearPriceSlope,
              uint128 inflectionPrice,
              uint32 inflectionPoint,
              uint128 goldenEggFeesAccrued,
              uint128 balance,
              uint32 supply,
              uint32 maxSupply,
              uint32 buyFreezeTime,
              uint16 artistFeeBPS,
              uint16 affiliateFeeBPS,
              uint16 goldenEggFeeBPS,
              bytes32 affiliateMerkleRoot
            ) info
          )`,
        ]),
        baseProvider
      );

      const mintInfo = await minter.samInfo(collection);

      const totalPrice = await minter.totalBuyPriceAndFees(collection, mintInfo.supply, 1);

      // Include the mint fee into the price
      const price = totalPrice.total.toString();

      results.push({
        collection,
        contract: collection,
        stage: `claim-${minterAddress.toLowerCase()}`,
        kind: "public",
        status: "open",
        standard: STANDARD,
        details: {
          tx: {
            to: minterAddress.toLowerCase(),
            data: {
              // `buy`
              signature: "0xafab4364",
              params: [
                {
                  kind: "contract",
                  abiType: "address",
                },
                {
                  kind: "recipient",
                  abiType: "address",
                },
                {
                  kind: "quantity",
                  abiType: "uint32",
                },
                {
                  kind: "referrer",
                  abiType: "address",
                },
                {
                  kind: "unknown",
                  abiType: "bytes32[]",
                  abiValue: [],
                },
                {
                  kind: "unknown",
                  abiType: "uint256",
                  abiValue: "0",
                },
              ],
            },
          },
          info: {
            minter: minterAddress.toLowerCase(),
            hasDynamicPrice: true,
          },
        },
        currency: Sdk.Common.Addresses.Native[config.chainId],
        price,
        maxSupply: toSafeNumber(mintInfo.maxSupply),
        endTime: toSafeTimestamp(mintInfo.buyFreezeTime),
      });
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
      "0xafab4364", // `SAM.buy`
      "0x4a04a1c9", // `SuperMinter.mintTo`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    try {
      const parsed = new Interface([
        "function mint(address edition, uint128 mintId, uint32 quantity, address affiliate)",
        "function mint(address edition, uint128 mintId, uint32 quantity, bytes32[] proof, address affiliate)",
        "function mintTo(address edition, uint128 mintId, address to, uint32 quantity, address affiliate, bytes32[] affiliateProof, uint256 attributionId)",
        "function mintTo(address edition, uint128 mintId, address to, uint32 quantity, address allowlisted, bytes32[] proof, address affiliate, bytes32[] affiliateProof, uint256 attributionId)",
        "function buy(address edition, address to, uint32 quantity, address affiliate, bytes32[] affiliateProof, uint256 attributonId)",
        `function mintTo(
          (
            address edition,
            uint8 tier,
            uint8 scheduleNum,
            address to,
            uint32 quantity,
            address allowlisted,
            uint32 allowlistedQuantity,
            bytes32[] allowlistProof,
            uint96 signedPrice,
            uint32 signedQuantity,
            uint32 signedClaimTicket,
            uint32 signedDeadline,
            bytes signature,
            address affiliate,
            bytes32[] affiliateProof,
            uint256 attributionId
          ) mintData
        )`,
      ]).parseTransaction({
        data: tx.data,
      });

      // Using `SuperMinter`
      if (parsed.args.mintData) {
        const params = parsed.args.mintData;
        return extractByCollection(
          collection,
          tx.to,
          params.tier.toString(),
          params.scheduleNum.toString()
        );
      }

      const mintId = parsed.args.mintId ? parsed.args.mintId.toString() : undefined;
      return extractByCollection(collection, tx.to, mintId);
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
      (details.info! as Info).minter!,
      (details.info! as Info).mintId!,
      (details.info! as Info).scheduleNum
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
