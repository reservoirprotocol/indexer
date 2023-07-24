import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
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
import { getStatus, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";

const STANDARD = "foundation";

export const extractByCollectionERC721 = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const contract = new Contract(
    Sdk.Foundation.Addresses.DropMarket[config.chainId],
    new Interface([
      `
        function getFixedPriceSale(address nftContract) view returns (
          address seller,
          uint256 price,
          uint256 limitPerAccount,
          uint256 numberOfTokensAvailableToMint,
          bool marketCanMint,
          uint256 generalAvailabilityStartTime,
          uint256 earlyAccessStartTime
        )
      `,
    ]),
    baseProvider
  );

  try {
    const result = await contract.getFixedPriceSale(collection);
    const editionConfig: {
      seller: string;
      price: string;
      limitPerAccount: string;
      numberOfTokensAvailableToMint: string;
      marketCanMint: boolean;
      generalAvailabilityStartTime: string;
      earlyAccessStartTime: string;
    } = {
      seller: result.seller,
      price: result.price.toString(),
      limitPerAccount: result.limitPerAccount.toString(),
      numberOfTokensAvailableToMint: result.numberOfTokensAvailableToMint.toString(),
      marketCanMint: result.marketCanMint,
      generalAvailabilityStartTime: result.generalAvailabilityStartTime.toString(),
      earlyAccessStartTime: result.earlyAccessStartTime.toString(),
    };

    // Public sale
    results.push({
      collection,
      contract: collection,
      stage: "public-sale",
      kind: "public",
      status: "open",
      standard: STANDARD,
      details: {
        tx: {
          to: Sdk.Foundation.Addresses.DropMarket[config.chainId],
          data: {
            // `mintFromFixedPriceSale`
            signature: "0xecbc9554",
            params: [
              {
                kind: "contract",
                abiType: "address",
              },
              {
                kind: "quantity",
                abiType: "uint256",
              },
              {
                kind: "unknown",
                abiType: "address",
                abiValue: AddressZero,
              },
            ],
          },
        },
      },
      currency: Sdk.Common.Addresses.Native[config.chainId],
      price: editionConfig.price,
      maxMintsPerWallet: editionConfig.limitPerAccount,
      maxSupply: editionConfig.numberOfTokensAvailableToMint,
      startTime:
        editionConfig.generalAvailabilityStartTime != "0"
          ? toSafeTimestamp(editionConfig.generalAvailabilityStartTime)
          : undefined,
    });
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
      "0xecbc9554", // `mintFromFixedPriceSale`
      "0xd782d491", // `mintFromFixedPriceSaleWithEarlyAccessAllowlist`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    return extractByCollectionERC721(collection);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  // Fetch and save/update the currently available mints
  const latestCollectionMints = await extractByCollectionERC721(collection);
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
