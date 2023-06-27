import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { getMaxSupply, getStatus, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";

const STANDARD = "seadrop-v1.0";

export const extractByCollection = async (collection: string): Promise<CollectionMint[]> => {
  const SEADROP = "0x00005ea00ac477b1030ce78506496e8c2de24bf5";

  const c = new Contract(
    SEADROP,
    new Interface([
      `
        function mintPublic(
          address nftContract,
          address feeRecipient,
          address minterIfNotPayer,
          uint256 quantity
        )
      `,
      `
        function getPublicDrop(address nftContract) view returns (
          (
            uint80 mintPrice,
            uint48 startTime,
            uint48 endTime,
            uint16 maxTotalMintableByWallet,
            uint16 feeBps,
            bool restrictFeeRecipients
          )
        )
      `,
      "function getAllowedFeeRecipients(address nftContract) view returns (address[])",
    ]),
    baseProvider
  );

  const results: CollectionMint[] = [];
  try {
    const drop = await c.getPublicDrop(collection);
    if (drop.startTime && drop.endTime) {
      return [
        {
          collection,
          contract: collection,
          stage: "public-sale",
          kind: "public",
          status: "open",
          standard: STANDARD,
          details: {
            tx: {
              to: SEADROP,
              data: {
                // `mintPublic`
                signature: "0x161ac21f",
                params: [
                  {
                    kind: "contract",
                    abiType: "address",
                  },
                  {
                    kind: drop.restrictFeeRecipients ? "unknown" : "recipient",
                    abiType: "address",
                    abiValue: drop.restrictFeeRecipients
                      ? (await c.getAllowedFeeRecipients(collection))[0].toLowerCase()
                      : undefined,
                  },
                  {
                    kind: "recipient",
                    abiType: "address",
                  },
                  {
                    kind: "quantity",
                    abiType: "uint256",
                  },
                ],
              },
            },
          },
          currency: Sdk.Common.Addresses.Eth[config.chainId],
          price: drop.mintPrice.toString(),
          maxMintsPerWallet: String(drop.maxTotalMintableByWallet),
          maxSupply: await getMaxSupply(collection),
          startTime: toSafeTimestamp(drop.startTime),
          endTime: toSafeTimestamp(drop.endTime),
        },
      ];
    }
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
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
      "0x161ac21f", // `mintPublic`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    return extractByCollection(collection);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, {
    standard: STANDARD,
  });

  // Fetch and save/update the currently available mints
  const latestCollectionMints = await extractByCollection(collection);
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
