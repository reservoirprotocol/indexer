import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { getStatus, toSafeNumber, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";

const STANDARD = "createdotfun";

const BasicMintModule = "0x000000000f30984de6843bbc1d109c95ea6242ac";

export const extractByCollectionERC721 = async (collection: string): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];
  try {
    const module = new Contract(
      BasicMintModule,
      new Interface([
        "function mintPayout() view returns (address)",
        `function configuration(address contract) view returns (
          (
            uint256 price,
            uint64 mintStart,
            uint64 mintEnd,
            uint32 maxPerWallet,
            uint32 maxPerTransaction,
            uint32 maxForModule,
            uint32 maxSupply,
          ) config
        )`,
      ]),
      baseProvider
    );

    const payout = new Contract(
      await module.mintPayout(),
      new Interface(["function protocolFee() view returns (uint256)"]),
      baseProvider
    );
    const protocolFee = await payout.protocolFee();

    const configuration = await module.configuration(collection);
    const price = bn(configuration.price).add(protocolFee).toString();

    results.push({
      collection,
      contract: collection,
      stage: `claim-${BasicMintModule}-${collection}`,
      kind: "public",
      status: "open",
      standard: STANDARD,
      details: {
        tx: {
          to: BasicMintModule,
          data: {
            // `mint_efficient_7e80c46e`
            signature: "0x00000000",
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
                kind: "referrer",
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
      currency: Sdk.Common.Addresses.Native[config.chainId],
      price,
      maxMintsPerWallet: toSafeNumber(configuration.maxPerWallet),
      maxSupply: toSafeNumber(configuration.maxSupply),
      startTime: toSafeTimestamp(configuration.mintStart),
      endTime: toSafeTimestamp(configuration.mintEnd),
    });
  } catch {
    // Skip errors
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
      "0x00000000", // `mint_efficient_7e80c46e`
    ].some((bytes4) => tx.data.startsWith(bytes4)) &&
    tx.to === BasicMintModule
  ) {
    return extractByCollectionERC721(collection);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  for (const { collection } of existingCollectionMints) {
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
