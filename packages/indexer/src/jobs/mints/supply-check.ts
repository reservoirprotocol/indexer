import { Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "mints-supply-check";

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

      await idb.none(
        `
          UPDATE collection_mints SET
            status = 'closed'
          WHERE collection_mints.collection_id = $/collection/
            AND collection_mints.max_supply <= (SELECT token_count FROM collections WHERE id = collection_mints.collection_id)
        `,
        { collection }
      );
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (collection: string, delay = 30) =>
  queue.add(QUEUE_NAME, { collection }, { delay: delay * 1000, jobId: collection });
