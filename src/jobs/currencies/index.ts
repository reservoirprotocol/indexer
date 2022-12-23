import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { tryGetCurrencyDetails } from "@/utils/currencies";

const QUEUE_NAME = "currencies-fetch";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 20,
    backoff: {
      type: "exponential",
      delay: 10000,
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
      const { currency } = job.data as JobData;

      const details = await tryGetCurrencyDetails(currency);
      await idb.none(
        `
          UPDATE currencies SET
            name = $/name/,
            symbol = $/symbol/,
            decimals = $/decimals/,
            metadata = $/metadata:json/
          WHERE contract = $/contract/
        `,
        {
          contract: toBuffer(currency),
          ...details,
        }
      );
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type JobData = {
  currency: string;
};

export const addToQueue = async (data: JobData) => {
  await queue.add(data.currency, data, { jobId: data.currency });
};
