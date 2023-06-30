import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import {
  CollectionMint,
  CollectionMintStandard,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import * as detector from "@/orderbook/mints/calldata/detector";
import MetadataApi from "@/utils/metadata-api";

const QUEUE_NAME = "mints-process";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { by, data } = job.data as Mint;

      try {
        let collectionMints: CollectionMint[] = [];

        if (by === "tx") {
          collectionMints = await detector.extractByTx(data.txHash);
        }

        if (by === "collection") {
          const collectionExists = await idb.one(
            "SELECT 1 FROM collections WHERE collections.id = $/collection/",
            {
              collection: data.collection,
            }
          );
          if (!collectionExists) {
            const collection = await MetadataApi.getCollectionMetadata(data.collection, "0", "", {
              indexingMethod: "onchain",
            });

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
                  token_set_id
                ) VALUES (
                  $/id/,
                  $/slug/,
                  $/name/,
                  $/metadata:json/,
                  $/contract/,
                  ${tokenIdRangeParam},
                  $/tokenSetId/
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
              }
            );
          }

          switch (data.standard) {
            case "thirdweb": {
              collectionMints = await detector.thirdweb.extractByCollection(
                data.collection,
                data.tokenId
              );
              break;
            }

            case "zora": {
              collectionMints = await detector.zora.extractByCollection(data.collection);
              break;
            }
          }
        }

        for (const collectionMint of collectionMints) {
          const result = await simulateAndUpsertCollectionMint(collectionMint);
          logger.info("mints-process", JSON.stringify({ success: result, collectionMint }));
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        logger.error(
          QUEUE_NAME,
          `Failed to process mint ${JSON.stringify(job.data)}: ${error} (${error.stack})`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 30 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type Mint =
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
      };
    };

export const addToQueue = async (mints: Mint[]) =>
  queue.addBulk(
    mints.map((mint) => ({
      name: randomUUID(),
      data: mint,
      opts: {
        // Deterministic job id so that we don't perform duplicated work
        jobId: mint.by === "tx" ? mint.data.txHash : undefined,
      },
    }))
  );
