import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { logger } from "@/common/logger";
import { acquireLock, redis, releaseLock } from "@/common/redis";
import { config } from "@/config/index";
import { idb } from "@/common/db";

const QUEUE_NAME = "events-sync-nft-transfers-write";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 10000,
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
      const { query } = job.data;

      try {
        if (await acquireLock(getLockName(), 60)) {
          for (const q of _.split(query, ";")) {
            await idb.none(q);
          }
        } else {
          await addToQueue(query);
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Failed flushing nft transfer events to the database: ${error}`);
        throw error;
      }
    },
    {
      connection: redis.duplicate(),
      // It's very important to have this queue be single-threaded
      // in order to avoid database write deadlocks (and it can be
      // even better to have it be single-process).
      concurrency: 1,
    }
  );

  worker.on("completed", async () => {
    await releaseLock(getLockName());
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const getLockName = () => {
  return `${QUEUE_NAME}-lock`;
};

export const addToQueue = async (query: string) => {
  await queue.add(randomUUID(), { query });
};
