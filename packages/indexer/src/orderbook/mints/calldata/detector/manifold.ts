import { Interface, Result } from "@ethersproject/abi";
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
  toSafeNumber,
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
  options?: {
    extension?: string;
  }
): Promise<CollectionMint[]> => {
  const nft = new Contract(
    collection,
    new Interface([
      "function getExtensions() view returns (address[])",
      "function VERSION() view returns (uint256)",
    ]),
    baseProvider
  );

  const extensions = options?.extension ? [options.extension] : await nft.getExtensions();

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
                  uint256 cost,
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

        const [claim, mintFee, mintFeeMerkle] = await Promise.all([
          cV23.getClaim(collection, instanceId),
          cV23.MINT_FEE().catch(() => "0"),
          cV23.MINT_FEE_MERKLE().catch(() => "0"),
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

    if (!claimConfig) {
      try {
        const cVUnknown = new Contract(
          extension,
          new Interface([
            `
              function getClaim(address creatorContractAddress, uint256 claimIndex) view returns (
                (
                  uint32 total,
                  uint32 totalMax,
                  uint32 walletMax,
                  uint48 startDate,
                  uint48 endDate,
                  uint8 storageProtocol,
                  uint8 contractVersion,
                  bool identical,
                  bytes32 merkleRoot,
                  string location,
                  uint256 cost,
                  address paymentReceiver,
                  address erc20
                ) claim
              )
            `,
            "function MINT_FEE() view returns (uint256)",
            "function MINT_FEE_MERKLE() view returns (uint256)",
          ]),
          baseProvider
        );

        const [claim, mintFee, mintFeeMerkle] = await Promise.all([
          cVUnknown.getClaim(collection, instanceId),
          cVUnknown.MINT_FEE().catch(() => "0"),
          cVUnknown.MINT_FEE_MERKLE().catch(() => "0"),
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
      const isClosed = !(
        bn(claimConfig.totalMax).eq(0) || bn(claimConfig.total).lte(bn(claimConfig.totalMax))
      );

      try {
        // Public sale
        if (claimConfig.merkleRoot === HashZero) {
          // Include the Manifold mint fee into the price
          const price = bn(claimConfig.cost).add(bn(claimConfig.mintFee)).toString();
          results.push({
            collection,
            contract: collection,
            stage: `claim-${extension.toLowerCase()}-${instanceId}`,
            kind: "public",
            status: isClosed ? "closed" : "open",
            standard: STANDARD,
            details: {
              tx: {
                to: extension.toLowerCase(),
                data: {
                  // `mintProxy`
                  signature: "0x07591acc",
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
            maxMintsPerWallet: toSafeNumber(claimConfig.walletMax),
            maxSupply: toSafeNumber(claimConfig.totalMax),
            startTime: toSafeTimestamp(claimConfig.startDate),
            endTime: toSafeTimestamp(claimConfig.endDate),
          });
        }

        // Allowlist sale
        if (claimConfig.merkleRoot !== HashZero) {
          // Include the Manifold mint fee into the price
          const price = bn(claimConfig.cost).add(bn(claimConfig.mintFeeMerkle)).toString();

          const merkleTreeId = await fetchMetadata(
            `https://apps.api.manifoldxyz.dev/public/instance/data?id=${instanceId}`
          ).then((data) => data.publicData.merkleTreeId);

          results.push({
            collection,
            contract: collection,
            stage: `claim-${extension.toLowerCase()}-${instanceId}`,
            kind: "allowlist",
            status: isClosed ? "closed" : "open",
            standard: STANDARD,
            details: {
              tx: {
                to: extension.toLowerCase(),
                data: {
                  // `mintProxy`
                  signature: "0x07591acc",
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
            maxMintsPerWallet: toSafeNumber(claimConfig.walletMax),
            maxSupply: toSafeNumber(claimConfig.totalMax),
            startTime: toSafeTimestamp(claimConfig.startDate),
            endTime: toSafeTimestamp(claimConfig.endDate),
            allowlistId: claimConfig.merkleRoot,
          });
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
  options?: {
    // Only needed for old versions of the lazy payable claim contract (which work off the instance id)
    instanceId?: string;
    // Only needed for new versions of the lazy payable claim contract (which work off the token id)
    tokenId?: string;
    extension?: string;
  }
): Promise<CollectionMint[]> => {
  const extensions = options?.extension
    ? [options?.extension]
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
        `
          function getClaim(address creatorContractAddress, uint256 claimIndex) external view returns (
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
      let claim: Result | undefined;
      let tokenId: string | undefined;
      let instanceId: string | undefined;

      const missesDetails = () => !claim || !tokenId || !instanceId;

      let hasMintFee = false;
      let mintFee = bn(0);
      let mintFeeMerkle = bn(0);
      try {
        mintFee = await c.MINT_FEE();
        mintFeeMerkle = await c.MINT_FEE_MERKLE();
        hasMintFee = true;
      } catch {
        // Skip errors
      }

      if (missesDetails() && !hasMintFee && options?.instanceId) {
        const c = new Contract(
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
                  bytes32 merkleRoot,
                  string location,
                  uint256 tokenId,
                  uint256 cost,
                  address payable paymentReceiver
                ) claim
              )
            `,
          ]),
          baseProvider
        );
        const result = await c.getClaim(collection, options?.instanceId);
        claim = result;
        tokenId = result.tokenId.toString();
        instanceId = options.instanceId;
      }

      if (missesDetails() && options?.tokenId) {
        try {
          const result = await c.getClaimForToken(collection, options.tokenId);
          claim = result.claim;
          tokenId = options.tokenId;
          instanceId = result.instanceId.toString();
        } catch {
          // Skip errors
        }
      }

      if (missesDetails() && options?.instanceId) {
        try {
          const result = await c.getClaim(collection, options.instanceId);
          claim = result;
          tokenId = result.tokenId.toString();
          instanceId = options.instanceId;
        } catch {
          // Skip errors
        }
      }

      if (missesDetails()) {
        throw new Error("Failed to fetch the claim configuration");
      }

      // To make TS happy
      claim = claim!;

      const isClosed = !(bn(claim.totalMax).eq(0) || bn(claim.total).lte(bn(claim.totalMax)));

      if (
        instanceId !== "0" &&
        (!claim.erc20 || claim.erc20.toLowerCase() === Sdk.Common.Addresses.Native[config.chainId])
      ) {
        // Public sale
        if (claim.merkleRoot === HashZero) {
          // Include the Manifold mint fee into the price
          const price = bn(claim.cost).add(mintFee).toString();

          results.push({
            collection,
            contract: collection,
            stage: `claim-${extension.toLowerCase()}-${instanceId}`,
            kind: "public",
            status: isClosed ? "closed" : "open",
            standard: STANDARD,
            details: {
              tx: {
                to: extension.toLowerCase(),
                data: {
                  // `mintProxy`
                  signature: "0x07591acc",
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
            tokenId,
            maxMintsPerWallet: toSafeNumber(claim.walletMax),
            maxSupply: toSafeNumber(claim.totalMax),
            startTime: toSafeTimestamp(claim.startDate),
            endTime: toSafeTimestamp(claim.endDate),
          });
        }

        // Allowlist sale
        if (claim.merkleRoot !== HashZero) {
          // Include the Manifold mint fee into the price
          const price = bn(claim.cost).add(mintFeeMerkle).toString();

          const merkleTreeId = await fetchMetadata(
            `https://apps.api.manifoldxyz.dev/public/instance/data?id=${instanceId}`
          ).then((data) => data.publicData.merkleTreeId);

          results.push({
            collection,
            contract: collection,
            stage: `claim-${extension.toLowerCase()}-${instanceId}`,
            kind: "allowlist",
            status: isClosed ? "closed" : "open",
            standard: STANDARD,
            details: {
              tx: {
                to: extension.toLowerCase(),
                data: {
                  // `mintProxy`
                  signature: "0x07591acc",
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
            tokenId,
            maxMintsPerWallet: toSafeNumber(claim.walletMax),
            maxSupply: toSafeNumber(claim.totalMax),
            startTime: toSafeTimestamp(claim.startDate),
            endTime: toSafeTimestamp(claim.endDate),
            allowlistId: claim.merkleRoot,
          });
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
      "0x07591acc", // `mintProxy`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    const contractKind =
      (await commonHelpers.getContractKind(collection)) ?? (await getContractKind(collection));

    // `mintBatch` and `mintProxy` have the same interface
    const instanceId = new Interface([
      "function mint(address creatorContractAddress, uint256 instanceId, uint32 mintIndex, bytes32[] calldata merkleProof, address mintFor)",
      "function mintBatch(address creatorContractAddress, uint256 instanceId, uint16 mintCount, uint32[] calldata mintIndices, bytes32[][] calldata merkleProofs, address mintFor)",
    ])
      .decodeFunctionData(tx.data.startsWith("0xfa2b068f") ? "mint" : "mintBatch", tx.data)
      .instanceId.toString();

    if (contractKind === "erc721") {
      return extractByCollectionERC721(collection, instanceId, { extension: tx.to });
    } else if (contractKind === "erc1155") {
      return extractByCollectionERC1155(collection, { instanceId, extension: tx.to });
    }
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  let latestCollectionMints: CollectionMint[] = [];
  for (const { tokenId, details } of existingCollectionMints) {
    // Fetch and save/update the currently available mints
    const collectionMints = tokenId
      ? await extractByCollectionERC1155(collection, {
          tokenId,
          instanceId: (details.info! as Info).instanceId,
        })
      : await extractByCollectionERC721(collection, (details.info! as Info).instanceId!);

    latestCollectionMints = latestCollectionMints.concat(collectionMints);
  }

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
    const info = collectionMint.details.info! as Info;
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
