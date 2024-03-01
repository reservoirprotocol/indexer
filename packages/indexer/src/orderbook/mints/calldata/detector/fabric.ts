import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import { getStatus, toSafeNumber } from "@/orderbook/mints/calldata/helpers";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";

const STANDARD = "fabric";

export const extractByCollectionERC721 = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const contract = new Contract(
    collection,
    new Interface([
      "function tps() view returns (uint256)",
      "function minPurchaseSeconds() view returns (uint256)",
      "function paused() view returns (bool)",
      "function supplyDetail() view returns (uint256, uint256)",
    ]),
    baseProvider
  );

  try {
    const [tps, minPurchaseSeconds, paused, [numMinted, supplyCap]]: [
      BigNumber,
      BigNumber,
      boolean,
      [BigNumber, BigNumber]
    ] = await Promise.all([
      contract.tps(),
      contract.minPurchaseSeconds(),
      contract.paused(),
      contract.supplyDetail(),
    ]);

    const maxSupply = supplyCap.toString();
    const endPrice = tps.mul(minPurchaseSeconds).toString();
    const isOpen = !paused && numMinted.lt(supplyCap);

    results.push({
      collection,
      contract: collection,
      stage: `public-sale-${collection}`,
      kind: "public",
      status: isOpen ? "open" : "closed",
      standard: STANDARD,
      details: {
        tx: {
          to: collection,
          data: {
            // "mintFor"
            signature: "0xda1919b3",
            params: [
              {
                kind: "recipient",
                abiType: "address",
              },
              {
                kind: "unknown",
                abiType: "uint256",
                abiValue: endPrice.toString(),
              },
            ],
          },
        },
      },
      currency: Sdk.Common.Addresses.Native[config.chainId],
      price: endPrice,
      maxSupply: toSafeNumber(maxSupply),
      maxMintsPerWallet: toSafeNumber(1),
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
      "0xa0712d68", // `mint`
      "0xda1919b3", // `mintFor`
      "0x8d8818af", // `mintWithReferral`
      "0xfeed3a9c", // `mintWithReferralFor`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    return extractByCollectionERC721(collection);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, {
    standard: STANDARD,
  });

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
