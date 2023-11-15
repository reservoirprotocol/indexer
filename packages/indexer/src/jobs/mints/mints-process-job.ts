import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer, toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { collectionNewContractDeployedJob } from "@/jobs/collections/collection-contract-deployed";
import { mintsRefreshJob, triggerDelayedRefresh } from "@/jobs/mints/mints-refresh-job";
import MetadataProviderRouter from "@/metadata/metadata-provider-router";
import {
  CollectionMint,
  CollectionMintStandard,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import * as detector from "@/orderbook/mints/calldata/detector";
import { getContractKind } from "@/orderbook/mints/calldata/helpers";

export type MintsProcessJobPayload =
  | {
      by: "tx";
      data: {
        txHash: string;
      };
    }
  | {
      by: "collection";
      data: {
        standard: CollectionMintStandard;
        collection: string;
        tokenId?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        additionalInfo?: any;
      };
    };

export default class MintsProcessJob extends AbstractRabbitMqJobHandler {
  queueName = "mints-process";
  maxRetries = 3;
  concurrency = 30;
  lazyMode = true;

  public async process(payload: MintsProcessJobPayload) {
    const { by, data } = payload;

    try {
      let collectionMints: CollectionMint[] = [];

      // Process new mints knowing a mint transaction
      if (by === "tx") {
        collectionMints = await detector.extractByTx(data.txHash);
      }

      // Process new mints knowing the collection (triggered from a standard-specific on-chain event)
      if (by === "collection") {
        // Make sure the collection exists
        const collectionExists = await idb.oneOrNone(
          "SELECT 1 FROM collections WHERE collections.id = $/collection/",
          {
            collection: data.collection,
          }
        );
        if (!collectionExists) {
          const collection = await MetadataProviderRouter.getCollectionMetadata(
            data.collection,
            "0",
            "",
            {
              indexingMethod:
                data.standard === "manifold"
                  ? "manifold"
                  : data.standard === "seadrop-v1.0"
                  ? "opensea"
                  : "onchain",
              additionalQueryParams:
                data.standard === "manifold"
                  ? { instanceId: data.additionalInfo.instanceId }
                  : undefined,
            }
          );

          let tokenIdRange: string | null = null;
          if (collection.tokenIdRange) {
            tokenIdRange = `numrange(${collection.tokenIdRange[0]}, ${collection.tokenIdRange[1]}, '[]')`;
          } else if (collection.id === data.collection) {
            tokenIdRange = `'(,)'::numrange`;
          }

          // For covering the case where the token id range is null
          const tokenIdRangeParam = tokenIdRange ? "$/tokenIdRange:raw/" : "$/tokenIdRange/";

          await idb.none(
            `
              INSERT INTO collections (
                id,
                slug,
                name,
                metadata,
                contract,
                token_id_range,
                token_set_id,
                creator
              ) VALUES (
                $/id/,
                $/slug/,
                $/name/,
                $/metadata:json/,
                $/contract/,
                ${tokenIdRangeParam},
                $/tokenSetId/,
                $/creator/
              ) ON CONFLICT DO NOTHING
            `,
            {
              id: collection.id,
              slug: collection.slug,
              name: collection.name,
              metadata: collection.metadata,
              contract: toBuffer(collection.contract),
              tokenIdRange,
              tokenSetId: collection.tokenSetId,
              creator: collection.creator ? toBuffer(collection.creator) : null,
            }
          );
        }

        // Make sure the contract exists
        const contractResult = await idb.one(
          `
            SELECT
              contracts.kind,
              collections.contract
            FROM collections
            LEFT JOIN contracts
              ON collections.contract = contracts.address
            WHERE collections.id = $/collection/
          `,
          {
            collection: data.collection,
          }
        );
        let kind = contractResult.kind;
        if (!kind) {
          kind = await getContractKind(fromBuffer(contractResult.contract));
          if (!kind) {
            throw new Error("Could not detect contract kind");
          }

          await collectionNewContractDeployedJob.addToQueue({
            contract: contractResult.contract,
          });
        }

        switch (data.standard) {
          case "decent": {
            collectionMints = await detector.decent.extractByCollectionERC721(data.collection);

            break;
          }

          case "foundation": {
            collectionMints = await detector.foundation.extractByCollectionERC721(data.collection);

            break;
          }

          case "manifold": {
            if (kind === "erc721") {
              collectionMints = await detector.manifold.extractByCollectionERC721(
                data.collection,
                data.additionalInfo.instanceId,
                data.additionalInfo.extension
              );
            } else if (kind === "erc1155") {
              collectionMints = await detector.manifold.extractByCollectionERC1155(
                data.collection,
                {
                  instanceId: data.additionalInfo.instanceId,
                  extension: data.additionalInfo.extension,
                }
              );
            }

            break;
          }

          case "seadrop-v1.0": {
            collectionMints = await detector.seadrop.extractByCollectionERC721(data.collection);

            break;
          }

          case "thirdweb": {
            if (data.tokenId) {
              collectionMints = await detector.thirdweb.extractByCollectionERC1155(
                data.collection,
                data.tokenId
              );
            } else {
              collectionMints = await detector.thirdweb.extractByCollectionERC721(data.collection);
            }

            break;
          }

          case "zora": {
            if (data.tokenId) {
              collectionMints = await detector.zora.extractByCollectionERC1155(
                data.collection,
                data.tokenId
              );
            } else {
              collectionMints = await detector.zora.extractByCollectionERC721(data.collection);
            }

            break;
          }

          case "soundxyz": {
            collectionMints = await detector.soundxyz.extractByCollection(
              data.collection,
              data.additionalInfo.minter,
              data.additionalInfo.mintId
            );
            break;
          }

          case "createdotfun": {
            collectionMints = await detector.createdotfun.extractByCollectionERC721(
              data.collection
            );
            break;
          }
        }

        // Also refresh (to clean up any old stages)
        await mintsRefreshJob.addToQueue({ collection: data.collection });
      }

      for (const collectionMint of collectionMints) {
        const result = await simulateAndUpsertCollectionMint(collectionMint);
        logger.info("mints-process", JSON.stringify({ success: result, collectionMint }));

        // Refresh the collection with a delay
        if (result) {
          await triggerDelayedRefresh(collectionMint.collection);
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      logger.error(
        this.queueName,
        `Failed to process mint ${JSON.stringify(payload)}: ${error} (${error.stack})`
      );
      throw error;
    }
  }

  public async addToQueue(mints: MintsProcessJobPayload[], force = false) {
    await this.sendBatch(
      mints.map((mint) => {
        return {
          payload: mint,
          jobId: force ? undefined : mint.by === "tx" ? mint.data.txHash : undefined,
        };
      })
    );
  }
}

export const mintsProcessJob = new MintsProcessJob();
