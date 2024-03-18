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

const STANDARD = "mirror";

export const extractByCollectionERC721 = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  const contract = new Contract(
    collection,
    new Interface([
      "function treasuryConfiguration() view returns (address)",
      "function price() view returns (uint256)",
      "function limit() view returns (uint256)",
      "function totalSupply() view returns (uint256)",
    ]),
    baseProvider
  );

  try {
    const treasuryConfigurationAddress = await contract.treasuryConfiguration();
    const treasuryConfiguration = new Contract(
      treasuryConfigurationAddress,
      new Interface(["function feeConfiguration() view returns (address)"]),
      baseProvider
    );

    const feeConfigurationAddress = await treasuryConfiguration.feeConfiguration();
    const feeConfiguration = new Contract(
      feeConfigurationAddress,
      new Interface(["function flatFeeAmount() view returns (uint256)"]),
      baseProvider
    );

    const [price, flatFeeAmount, limit, totalSupply]: [BigNumber, BigNumber, BigNumber, BigNumber] =
      await Promise.all([
        contract.price(),
        feeConfiguration.flatFeeAmount(),
        contract.limit(),
        contract.totalSupply(),
      ]);

    const totalPrice = price.add(flatFeeAmount).toString();
    const isOpen = limit.gt(0) ? totalSupply.lt(limit) : true;

    results.push({
      collection,
      contract: collection,
      stage: "public-sale",
      kind: "public",
      status: isOpen ? "open" : "closed",
      standard: STANDARD,
      details: {
        tx: {
          to: collection,
          data: {
            // "purchase"
            signature: "0x434dcfba",
            params: [
              {
                kind: "recipient",
                abiType: "address",
              },
              {
                kind: "comment",
                abiType: "string",
              },
              {
                kind: "referrer",
                abiType: "address",
              },
            ],
          },
        },
      },
      currency: Sdk.Common.Addresses.Native[config.chainId],
      price: totalPrice,
      maxSupply: limit.gt(0) ? toSafeNumber(limit) : undefined,
      maxMintsPerTransaction: "1",
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
      "0x434dcfba", // `purchase`
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
