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
import { getStatus, toSafeNumber, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";

const STANDARD = "fairxyz";

export type Info = {
  editionId: string;
};

export const extractByCollection = async (
  collection: string,
  editionId: string
): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];

  try {
    const nft = new Contract(
      collection,
      new Interface([
        `
          function getEdition(uint256 editionId) view returns (
            (
              uint40 maxMintsPerWallet,
              uint40 maxSupply,
              bool burnable,
              bool signatureReleased,
              bool soulbound
            ) edition
          )
        `,
      ]),
      baseProvider
    );

    const edition = await nft.getEdition(editionId);

    const registry = new Contract(
      Sdk.FairXyz.Addresses.StagesRegistry[config.chainId],
      new Interface([
        `
          function viewActiveStage(address registrant, uint256 scheduleId) view returns (
            (
              address fairxyzSigner,
              address fairxyzWithdrawAddress,
              uint256 fairxyzFee,
            ) fairxyzParameters,
            uint256 index,
            (
              uint40 startTime,
              uint40 endTime,
              uint40 mintsPerWallet,
              uint40 phaseLimit,
              uint96 price,
              bool signatureReleased
            ) stage
          )
        `,
      ]),
      baseProvider
    );

    const result = await registry.viewActiveStage(collection, editionId);

    const { stage, fairxyzParameters } = result;
    const signatureReleased = edition.signatureReleased || stage.signatureReleased;

    if (signatureReleased) {
      const price = stage.price.add(fairxyzParameters.fairxyzFee).toString();

      results.push({
        collection,
        contract: collection,
        stage: `claim-${collection.toLowerCase()}`,
        kind: "public",
        status: "open",
        standard: STANDARD,
        details: {
          tx: {
            to: collection,
            data: {
              // `mintEdition`
              signature: "0x0c267ed6",
              params: [
                {
                  kind: "unknown",
                  abiType: "uint256",
                  abiValue: editionId,
                },
                {
                  kind: "recipient",
                  abiType: "address",
                },
                {
                  kind: "quantity",
                  abiType: "uint256",
                },
                {
                  kind: "unknown",
                  abiType: "uint40",
                  abiValue: "0",
                },
                {
                  kind: "unknown",
                  abiType: "uint256",
                  abiValue: "0",
                },
                {
                  kind: "unknown",
                  abiType: "bytes",
                  abiValue: "0x",
                },
              ],
            },
          },
          info: {
            editionId,
          },
        },
        currency: Sdk.Common.Addresses.Native[config.chainId],
        price,
        maxMintsPerWallet: edition.maxMintsPerWallet,
        maxSupply: toSafeNumber(edition.maxSupply),
        startTime: toSafeTimestamp(stage.startTime),
        endTime: toSafeTimestamp(stage.endTime),
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
      "0x0c267ed6", // `mintEdition`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    try {
      const parsed = new Interface([
        `function mintEdition(
          uint256 editionId,
          address recipient,
          uint256 quantity,
          uint40 signatureNonce,
          uint256 signatureMaxMints,
          bytes signature
        )`,
      ]).parseTransaction({
        data: tx.data,
      });

      const editionId = parsed.args.editionId.toString();
      return extractByCollection(collection, editionId);
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
      (details.info! as Info).editionId
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
