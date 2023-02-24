import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { idb } from "@/common/db";

const QUEUE_NAME = "collection-recalc-token-count-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: true,
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
      const { collection } = job.data;
      const query = `
          UPDATE "collections"
          SET "token_count" = (SELECT COUNT(*) FROM "tokens" WHERE "collection_id" = $/collection/),
              "updated_at" = now()
          WHERE "id" = $/collection/;
      `;

      await idb.none(query, {
        collection,
      });
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (collection: string, delay = 60 * 1000) => {
  await queue.add(collection, { collection }, { delay, jobId: collection });
};
