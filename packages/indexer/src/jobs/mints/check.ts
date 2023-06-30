import { Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { getCollectionMints } from "@/orderbook/mints";
import { getStatus } from "@/orderbook/mints/calldata/helpers";

const QUEUE_NAME = "mints-check";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 1,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 0,
    removeOnFail: 1000,
    timeout: 5000,
  },
});
export let worker: Worker | undefined;

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { collection } = job.data;

      const collectionMints = await getCollectionMints(collection, { status: "open" });
      for (const collectionMint of collectionMints) {
        const status = await getStatus(collectionMint);
        if (status === "closed") {
          await idb.none(
            `
              UPDATE collection_mints SET
                status = 'closed',
                updated_at = now()
              WHERE collection_mints.collection_id = $/collection/
                AND collection_mints.stage = $/stage/
                AND collection_mints.token_id = $/tokenId/
            `,
            {
              collection: collectionMint.collection,
              stage: collectionMint.stage,
              tokenId: collectionMint.tokenId ?? null,
            }
          );
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (collection: string, delay = 30) =>
  queue.add(QUEUE_NAME, { collection }, { delay: delay * 1000, jobId: collection });
