import { Interface } from "@ethersproject/abi";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { getStatus, toSafeTime } from "@/orderbook/mints/calldata/helpers";

export const extractByCollection = async (
  collection: string,
  tokenId?: string
): Promise<CollectionMint[]> => {
  const isERC1155 = Boolean(tokenId);

  const c = new Contract(
    collection,
    new Interface(
      isERC1155
        ? [
            "function getActiveClaimConditionId(uint256 tokenId) view returns (uint256)",
            `function getClaimConditionById(uint256 tokenId, uint256 conditionId) view returns (
              (
                uint256 startTimestamp,
                uint256 maxClaimableSupply,
                uint256 supplyClaimed,
                uint256 quantityLimitPerWallet,
                bytes32 merkleRoot,
                uint256 pricePerToken,
                address currency,
                string metadata
              )
            )`,
          ]
        : [
            "function getActiveClaimConditionId() view returns (uint256)",
            `function getClaimConditionById(uint256 conditionId) view returns (
              (
                uint256 startTimestamp,
                uint256 maxClaimableSupply,
                uint256 supplyClaimed,
                uint256 quantityLimitPerWallet,
                bytes32 merkleRoot,
                uint256 pricePerToken,
                address currency,
                string metadata
              )
            )`,
          ]
    ),
    baseProvider
  );

  const results: CollectionMint[] = [];
  try {
    // Thirdweb mints can have a single active claim at any particular time

    const claimConditionId = bn(
      isERC1155 ? await c.getActiveClaimConditionId(tokenId) : await c.getActiveClaimConditionId()
    ).toNumber();

    const claimCondition = isERC1155
      ? await c.getClaimConditionById(tokenId, claimConditionId)
      : await c.getClaimConditionById(claimConditionId);

    if (
      claimCondition.merkleRoot === HashZero &&
      claimCondition.currency.toLowerCase() === Sdk.ZeroExV4.Addresses.Eth[config.chainId]
    ) {
      const price = claimCondition.pricePerToken.toString();
      const maxMintsPerWallet = claimCondition.quantityLimitPerWallet.toString();

      results.push({
        collection,
        contract: collection,
        stage: `claim-${claimConditionId}`,
        kind: "public",
        status: "open",
        standard: "thirdweb",
        details: {
          tx: {
            to: collection,
            data: {
              // `claim`
              signature: isERC1155 ? "0x57bc3d78" : "0x84bb1e42",
              params: [
                {
                  kind: "recipient",
                  abiType: "address",
                },
                isERC1155
                  ? {
                      kind: "unknown",
                      abiKind: "uint256",
                      abiValue: tokenId!,
                    }
                  : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (undefined as any),
                {
                  kind: "quantity",
                  abiType: "uint256",
                },
                {
                  kind: "unknown",
                  abiType: "address",
                  abiValue: Sdk.ZeroExV4.Addresses.Eth[config.chainId],
                },
                {
                  kind: "unknown",
                  abiType: "uint256",
                  abiValue: price,
                },
                {
                  kind: "unknown",
                  abiType: "(bytes32[],uint256,uint256,address)",
                  abiValue: [
                    [HashZero],
                    maxMintsPerWallet,
                    price,
                    Sdk.ZeroExV4.Addresses.Eth[config.chainId],
                  ],
                },
                {
                  kind: "unknown",
                  abiType: "bytes",
                  abiValue: "0x",
                },
              ].filter(Boolean),
            },
          },
        },
        currency: Sdk.Common.Addresses.Eth[config.chainId],
        price,
        tokenId,
        maxMintsPerWallet,
        maxSupply: claimCondition.maxClaimableSupply.toString(),
        startTime: toSafeTime(claimCondition.startTimestamp),
      });
    }
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: "thirdweb", error }));
  }

  // Update the status of each collection mint
  await Promise.all(
    results.map(async (cm) => {
      cm.status = await getStatus(cm);
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
      "0x84bb1e42", // `claim` (ERC721)
      "0x57bc3d78", // `claim` (ERC1155)
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    const isERC1155 = tx.data.startsWith("0x57bc3d78");
    const tokenId: string | undefined = isERC1155
      ? new Interface([
          `
            function claim(
              address receiver,
              uint256 tokenId,
              uint256 quantity,
              address currency,
              uint256 pricePerToken,
              (
                bytes32[] proof,
                uint256 quantityLimitPerWallet,
                uint256 pricePerToken,
                address currency
              ) allowlistProof,
              bytes memory data
            )
          `,
        ])
          .decodeFunctionData("claim", tx.data)
          .tokenId.toString()
      : undefined;

    return extractByCollection(collection, tokenId);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: "thirdweb" });

  const uniqueTokenIds = [...new Set(existingCollectionMints.map(({ tokenId }) => tokenId))];
  for (const tokenId of uniqueTokenIds) {
    // Fetch and save/update the currently available mints
    const latestCollectionMints = await extractByCollection(collection, tokenId);
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
