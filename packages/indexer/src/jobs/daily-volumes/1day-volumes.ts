import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { DailyVolume } from "../../models/daily-volumes/daily-volume";

// queue name
const QUEUE_NAME = "calculate-1day-volumes";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    removeOnComplete: true,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      let retry = job.data.retry;

      const updateResult = await DailyVolume.update1Day();

      if (updateResult) {
        logger.info(
          "daily-volumes",
          `Finished updating the 1day volume on collections table. retry=${retry}`
        );
      } else {
        if (retry < 5) {
          logger.warn(
            "daily-volumes",
            `Something went wrong with updating the 1day volume on collections, will retry in a couple of minutes. retry=${retry}`
          );
          retry++;

          await addToQueue(retry);
        } else {
          logger.error(
            "daily-volumes",
            `Something went wrong with retrying during updating the 1day volume on collection, stopping. retry=${retry}`
          );
        }
      }

      return true;
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

/**
 * Add a 1day volume calculation job to the queue
 *
 * @param retry Retry mechanism
 */
export const addToQueue = async (retry = 0) => {
  await queue.add(
    randomUUID(),
    {
      retry,
    },
    {
      delay: retry ? retry ** 2 * 120 * 1000 : 0,
    }
  );
};
