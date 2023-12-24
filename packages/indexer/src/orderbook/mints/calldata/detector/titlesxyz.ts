import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import { getStatus, toSafeNumber, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";

const STANDARD = "titlesxyz";

export const extractByCollectionERC721 = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const contract = new Contract(
    collection,
    new Interface([
      "function price() external view returns (uint256)",
      "function maxSupply() external view returns (uint256)",
      "function mintLimitPerWallet() external view returns (uint256)",
      "function saleEndTime() external view returns (uint256)",
      "function DERIVATIVE_FEE() external view returns (uint256)",
    ]),
    baseProvider
  );

  try {
    const [price, maxSupply, mintLimitPerWallet, endTime, derivativeFee]: [
      BigNumber,
      string,
      string,
      number,
      BigNumber
    ] = await Promise.all([
      contract.price(),
      contract.maxSupply().then((res: BigNumber) => res.toString()),
      contract.mintLimitPerWallet().then((res: BigNumber) => res.toString()),
      contract.saleEndTime().then((res: BigNumber) => res.toNumber()),
      contract.DERIVATIVE_FEE(),
    ]);

    const endPrice = price.add(derivativeFee).toString();

    const isOpen = endTime < now();

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
            // "purchase"
            signature: "0xefef39a1",
            params: [
              {
                kind: "quantity",
                abiType: "uint256",
              },
            ],
          },
        },
      },
      currency: Sdk.Common.Addresses.Native[config.chainId],
      price: endPrice,
      maxSupply: toSafeNumber(maxSupply),
      maxMintsPerWallet: toSafeNumber(mintLimitPerWallet),
      endTime: toSafeTimestamp(endTime),
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
      "0xefef39a1", // `purchase`
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
