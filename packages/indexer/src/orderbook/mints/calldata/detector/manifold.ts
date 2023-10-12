import { Interface } from "@ethersproject/abi";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import {
  fetchMetadata,
  getContractKind,
  getStatus,
  toSafeTimestamp,
} from "@/orderbook/mints/calldata/helpers";
import * as commonHelpers from "@/orderbook/orders/common/helpers";

const STANDARD = "manifold";

export type Info = {
  merkleTreeId?: string;
  instanceId?: string;
};

export const extractByCollectionERC721 = async (
  collection: string,
  instanceId: string,
  extension?: string
): Promise<CollectionMint[]> => {
  const nft = new Contract(
    collection,
    new Interface([
      "function getExtensions() view returns (address[])",
      "function VERSION() view returns (uint256)",
    ]),
    baseProvider
  );

  const extensions = extension ? [extension] : await nft.getExtensions();

  let version: number | undefined;
  try {
    version = (await nft.VERSION()).toNumber();
  } catch {
    // Skip errors
  }

  const results: CollectionMint[] = [];
  for (const extension of extensions) {
    let claimConfig:
      | {
          total: number;
          totalMax: number;
          walletMax: number;
          startDate: number;
          endDate: number;
          storageProtocol: number;
          identical: boolean;
          merkleRoot: string;
          location: string;
          cost: string;
          paymentReceiver: string;
          erc20: string;
          mintFee: string;
          mintFeeMerkle: string;
        }
      | undefined;

    if (!claimConfig && (!version || version === 1)) {
      try {
        const cV1 = new Contract(
          extension,
          new Interface([
            `
              function getClaim(address creatorContractAddress, uint256 claimIndex) external view returns (
                (
                  uint32 total,
                  uint32 totalMax,
                  uint32 walletMax,
                  uint48 startDate,
                  uint48 endDate,
                  uint8 storageProtocol,
                  bool identical,
                  bytes32 merkleRoot,
                  string location,
                  uint cost,
                  address payable paymentReceiver
                ) claim
              )
            `,
          ]),
          baseProvider
        );

        const claim = await cV1.getClaim(collection, instanceId);
        claimConfig = {
          total: claim.total,
          totalMax: claim.totalMax,
          walletMax: claim.walletMax,
          startDate: claim.startDate,
          endDate: claim.endDate,
          storageProtocol: claim.storageProtocol,
          identical: claim.identical,
          merkleRoot: claim.merkleRoot,
          location: claim.location,
          cost: claim.cost.toString(),
          paymentReceiver: claim.paymentReceiver,
          erc20: Sdk.Common.Addresses.Native[config.chainId],
          mintFee: "0",
          mintFeeMerkle: "0",
        };
      } catch {
        // Skip errors
      }
    }

    if (!claimConfig && (!version || version > 1)) {
      try {
        const cV23 = new Contract(
          extension,
          new Interface([
            `
              function getClaim(address creatorContractAddress, uint256 claimIndex) external view returns (
                (
                  uint32 total,
                  uint32 totalMax,
                  uint32 walletMax,
                  uint48 startDate,
                  uint48 endDate,
                  uint8 storageProtocol,
                  ${version && version >= 3 ? "uint8 contractVersion," : ""}
                  bool identical,
                  bytes32 merkleRoot,
                  string location,
                  uint cost,
                  address payable paymentReceiver,
                  address erc20,
                ) claim
              )
            `,
            "function MINT_FEE() view returns (uint256)",
            "function MINT_FEE_MERKLE() view returns (uint256)",
          ]),
          baseProvider
        );

        const [claim, mintFee, mintFeeMerkle] = await Promise.all([
          cV23.getClaim(collection, instanceId),
          cV23.MINT_FEE(),
          cV23.MINT_FEE_MERKLE(),
        ]);
        claimConfig = {
          total: claim.total,
          totalMax: claim.totalMax,
          walletMax: claim.walletMax,
          startDate: claim.startDate,
          endDate: claim.endDate,
          storageProtocol: claim.storageProtocol,
          identical: claim.identical,
          merkleRoot: claim.merkleRoot,
          location: claim.location,
          cost: claim.cost.toString(),
          paymentReceiver: claim.paymentReceiver,
          erc20: claim.erc20,
          mintFee: mintFee.toString(),
          mintFeeMerkle: mintFeeMerkle.toString(),
        };
      } catch {
        // Skip errors
      }
    }

    if (claimConfig) {
      try {
        // Public sale
        if (claimConfig.merkleRoot === HashZero) {
          // Include the Manifold mint fee into the price
          const price = bn(claimConfig.cost).add(bn(claimConfig.mintFee)).toString();
          return [
            {
              collection,
              contract: collection,
              stage: `claim-${extension.toLowerCase()}-${instanceId}`,
              kind: "public",
              status: "open",
              standard: STANDARD,
              details: {
                tx: {
                  to: extension.toLowerCase(),
                  data: {
                    // `mintBatch`
                    signature: "0x26c858a4",
                    params: [
                      {
                        kind: "contract",
                        abiType: "address",
                      },
                      {
                        kind: "unknown",
                        abiType: "uint256",
                        abiValue: instanceId,
                      },
                      {
                        kind: "quantity",
                        abiType: "uint16",
                      },
                      {
                        kind: "unknown",
                        abiType: "uint32[]",
                        abiValue: [],
                      },
                      {
                        kind: "unknown",
                        abiType: "bytes32[][]",
                        abiValue: [],
                      },
                      {
                        kind: "recipient",
                        abiType: "address",
                      },
                    ],
                  },
                },
                info: {
                  instanceId,
                },
              },
              currency: Sdk.Common.Addresses.Native[config.chainId],
              price,
              maxMintsPerWallet: bn(claimConfig.walletMax).gt(0)
                ? claimConfig.walletMax.toString()
                : undefined,
              maxSupply: bn(claimConfig.totalMax).gt(0)
                ? claimConfig.totalMax.toString()
                : undefined,
              startTime: claimConfig.startDate ? toSafeTimestamp(claimConfig.startDate) : undefined,
              endTime: claimConfig.endDate ? toSafeTimestamp(claimConfig.endDate) : undefined,
            },
          ];
        }

        // Allowlist sale
        if (claimConfig.merkleRoot !== HashZero) {
          // Include the Manifold mint fee into the price
          const price = bn(claimConfig.cost).add(bn(claimConfig.mintFeeMerkle)).toString();

          const merkleTreeId = await fetchMetadata(
            `https://apps.api.manifoldxyz.dev/public/instance/data?id=${instanceId}`
          ).then((data) => data.publicData.merkleTreeId);

          return [
            {
              collection,
              contract: collection,
              stage: `claim-${extension.toLowerCase()}-${instanceId}`,
              kind: "allowlist",
              status: "open",
              standard: STANDARD,
              details: {
                tx: {
                  to: extension.toLowerCase(),
                  data: {
                    // `mintBatch`
                    signature: "0x26c858a4",
                    params: [
                      {
                        kind: "contract",
                        abiType: "address",
                      },
                      {
                        kind: "unknown",
                        abiType: "uint256",
                        abiValue: instanceId,
                      },
                      {
                        kind: "quantity",
                        abiType: "uint16",
                      },
                      {
                        kind: "allowlist",
                        abiType: "uint32[]",
                      },
                      {
                        kind: "allowlist",
                        abiType: "bytes32[][]",
                      },
                      {
                        kind: "recipient",
                        abiType: "address",
                      },
                    ],
                  },
                },
                info: {
                  merkleTreeId,
                  instanceId,
                },
              },
              currency: Sdk.Common.Addresses.Native[config.chainId],
              price,
              maxMintsPerWallet: bn(claimConfig.walletMax).gt(0)
                ? claimConfig.walletMax.toString()
                : undefined,
              maxSupply: bn(claimConfig.totalMax).gt(0)
                ? claimConfig.totalMax.toString()
                : undefined,
              startTime: claimConfig.startDate ? toSafeTimestamp(claimConfig.startDate) : undefined,
              endTime: claimConfig.endDate ? toSafeTimestamp(claimConfig.endDate) : undefined,
              allowlistId: claimConfig.merkleRoot,
            },
          ];
        }
      } catch (error) {
        logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
      }
    }
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

export const extractByCollectionERC1155 = async (
  collection: string,
  tokenId: string,
  extension?: string
): Promise<CollectionMint[]> => {
  const extensions = extension
    ? [extension]
    : await new Contract(
        collection,
        new Interface(["function getExtensions() view returns (address[])"]),
        baseProvider
      ).getExtensions();

  const results: CollectionMint[] = [];
  for (const extension of extensions) {
    const c = new Contract(
      extension,
      new Interface([
        `
          function getClaimForToken(address creatorContractAddress, uint256 tokenId) external view returns (
            uint256 instanceId,
            (
              uint32 total,
              uint32 totalMax,
              uint32 walletMax,
              uint48 startDate,
              uint48 endDate,
              uint8 storageProtocol,
              bytes32 merkleRoot,
              string location,
              uint256 tokenId,
              uint256 cost,
              address payable paymentReceiver,
              address erc20
            ) claim
          )
        `,
        "function MINT_FEE() view returns (uint256)",
        "function MINT_FEE_MERKLE() view returns (uint256)",
      ]),
      baseProvider
    );

    try {
      const result = await c.getClaimForToken(collection, tokenId);
      const instanceId = bn(result.instanceId).toString();
      const claim = result.claim;

      if (
        instanceId !== "0" &&
        claim.erc20.toLowerCase() === Sdk.Common.Addresses.Native[config.chainId]
      ) {
        // Public sale
        if (claim.merkleRoot === HashZero) {
          // Include the Manifold mint fee into the price
          const fee = await c.MINT_FEE();
          const price = bn(claim.cost).add(fee).toString();

          return [
            {
              collection,
              contract: collection,
              stage: `claim-${extension.toLowerCase()}-${instanceId}`,
              kind: "public",
              status: "open",
              standard: STANDARD,
              details: {
                tx: {
                  to: extension.toLowerCase(),
                  data: {
                    // `mintBatch`
                    signature: "0x26c858a4",
                    params: [
                      {
                        kind: "contract",
                        abiType: "address",
                      },
                      {
                        kind: "unknown",
                        abiType: "uint256",
                        abiValue: instanceId,
                      },
                      {
                        kind: "quantity",
                        abiType: "uint16",
                      },
                      {
                        kind: "unknown",
                        abiType: "uint32[]",
                        abiValue: [],
                      },
                      {
                        kind: "unknown",
                        abiType: "bytes32[][]",
                        abiValue: [],
                      },
                      {
                        kind: "recipient",
                        abiType: "address",
                      },
                    ],
                  },
                },
              },
              currency: Sdk.Common.Addresses.Native[config.chainId],
              price,
              tokenId,
              maxMintsPerWallet: bn(claim.walletMax).gt(0) ? claim.walletMax.toString() : undefined,
              maxSupply: bn(claim.totalMax).gt(0) ? claim.totalMax.toString() : undefined,
              startTime: claim.startDate ? toSafeTimestamp(claim.startDate) : undefined,
              endTime: claim.endDate ? toSafeTimestamp(claim.endDate) : undefined,
            },
          ];
        }

        // Allowlist sale
        if (claim.merkleRoot !== HashZero) {
          // Include the Manifold mint fee into the price
          const fee = await c.MINT_FEE_MERKLE();
          const price = bn(claim.cost).add(fee).toString();

          const merkleTreeId = await fetchMetadata(
            `https://apps.api.manifoldxyz.dev/public/instance/data?id=${instanceId}`
          ).then((data) => data.publicData.merkleTreeId);

          return [
            {
              collection,
              contract: collection,
              stage: `claim-${extension.toLowerCase()}-${instanceId}`,
              kind: "allowlist",
              status: "open",
              standard: STANDARD,
              details: {
                tx: {
                  to: extension.toLowerCase(),
                  data: {
                    // `mintBatch`
                    signature: "0x26c858a4",
                    params: [
                      {
                        kind: "contract",
                        abiType: "address",
                      },
                      {
                        kind: "unknown",
                        abiType: "uint256",
                        abiValue: instanceId,
                      },
                      {
                        kind: "quantity",
                        abiType: "uint16",
                      },
                      {
                        kind: "allowlist",
                        abiType: "uint32[]",
                      },
                      {
                        kind: "allowlist",
                        abiType: "bytes32[][]",
                      },
                      {
                        kind: "recipient",
                        abiType: "address",
                      },
                    ],
                  },
                },
                info: {
                  merkleTreeId,
                },
              },
              currency: Sdk.Common.Addresses.Native[config.chainId],
              price,
              tokenId,
              maxMintsPerWallet: bn(claim.walletMax).gt(0) ? claim.walletMax.toString() : undefined,
              maxSupply: bn(claim.totalMax).gt(0) ? claim.totalMax.toString() : undefined,
              startTime: claim.startDate ? toSafeTimestamp(claim.startDate) : undefined,
              endTime: claim.endDate ? toSafeTimestamp(claim.endDate) : undefined,
              allowlistId: claim.merkleRoot,
            },
          ];
        }
      }
    } catch (error) {
      logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
    }
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
      "0xfa2b068f", // `mint`
      "0x26c858a4", // `mintBatch`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    const contractKind =
      (await commonHelpers.getContractKind(collection)) ?? (await getContractKind(collection));

    const instanceId = new Interface([
      "function mint(address creatorContractAddress, uint256 instanceId, uint32 mintIndex, bytes32[] calldata merkleProof, address mintFor)",
      "function mintBatch(address creatorContractAddress, uint256 instanceId, uint16 mintCount, uint32[] calldata mintIndices, bytes32[][] calldata merkleProofs, address mintFor)",
    ])
      .decodeFunctionData(tx.data.startsWith("0xfa2b068f") ? "mint" : "mintBatch", tx.data)
      .instanceId.toString();

    if (contractKind === "erc721") {
      return extractByCollectionERC721(collection, instanceId, tx.to);
    } else if (contractKind === "erc1155") {
      const tokenId = await getTokenIdForERC1155Mint(collection, instanceId, tx.to);
      return extractByCollectionERC1155(collection, tokenId, tx.to);
    }
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  for (const { tokenId, details } of existingCollectionMints) {
    // Fetch and save/update the currently available mints
    const latestCollectionMints = tokenId
      ? await extractByCollectionERC1155(collection, tokenId)
      : await extractByCollectionERC721(collection, details.info!.instanceId!);
    for (const collectionMint of latestCollectionMints) {
      await simulateAndUpsertCollectionMint(collectionMint);
    }

    // Assume anything that exists in our system but was not returned
    // in the above call is not available anymore so we can close
    for (const existing of existingCollectionMints) {
      if (
        !latestCollectionMints.find(
          (latest) =>
            latest.collection === existing.collection &&
            latest.stage === existing.stage &&
            latest.tokenId === existing.tokenId
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

type ProofValue = { merkleProof: string[]; value: string };

export const generateProofValue = async (
  collectionMint: CollectionMint,
  address: string
): Promise<ProofValue> => {
  const cacheKey = `${collectionMint.collection}-${collectionMint.stage}-${collectionMint.tokenId}`;

  let result: ProofValue = await redis
    .get(cacheKey)
    .then((response) => (response ? JSON.parse(response) : undefined));
  if (!result) {
    const info = collectionMint.details.info!;
    result = await axios
      .get(
        `https://apps.api.manifoldxyz.dev/public/merkleTree/${info.merkleTreeId}/merkleInfo?address=${address}`
      )
      .then(({ data }: { data: { merkleProof: string[]; value: string }[] }) => data[0]);

    if (result) {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 3600);
    }
  }

  return result;
};

export const getTokenIdForERC1155Mint = async (
  collection: string,
  instanceId: string,
  extension: string
): Promise<string> => {
  const c = new Contract(
    extension,
    new Interface([
      `
        function getClaim(address creatorContractAddress, uint256 instanceId) external view returns (
          (
            uint32 total,
            uint32 totalMax,
            uint32 walletMax,
            uint48 startDate,
            uint48 endDate,
            uint8 storageProtocol,
            bytes32 merkleRoot,
            string location,
            uint256 tokenId,
            uint256 cost,
            address payable paymentReceiver,
            address erc20
          )
        )
      `,
    ]),
    baseProvider
  );

  return (await c.getClaim(collection, instanceId)).tokenId.toString();
};
