import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { DailyVolume } from "@/models/daily-volumes/daily-volume";

const QUEUE_NAME = "calculate-daily-volumes";

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
      // Get the startTime and endTime of the day we want to calculate
      const startTime = job.data.startTime;
      const ignoreInsertedRows = job.data.ignoreInsertedRows;
      let retry = job.data.retry;

      await DailyVolume.calculateDay(startTime, ignoreInsertedRows);

      if (await DailyVolume.tickLock()) {
        logger.info(
          "daily-volumes",
          `All daily volumes are finished processing, updating the collections table. startTime=${startTime}, retry=${retry}`
        );

        const updated = await DailyVolume.updateCollections(true);

        if (updated) {
          logger.info(
            "daily-volumes",
            `Finished updating the collections table. startTime=${startTime}, retry=${retry}`
          );
        } else {
          if (retry < 5) {
            logger.warn(
              "daily-volumes",
              `Something went wrong with updating the collections, will retry in a couple of minutes. startTime=${startTime}, retry=${retry}`
            );
            retry++;

            await addToQueue(startTime, true, retry);
          } else {
            logger.error(
              "daily-volumes",
              `Something went wrong with retrying during updating the collection, stopping. startTime=${startTime}, retry=${retry}`
            );
          }
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
 * Add a job to the queue with the beginning of the day you want to sync.
 * Beginning of the day is a unix timestamp, starting at 00:00:00
 *
 * @param startTime When startTime is null, we assume we want to calculate the previous day volume.
 * @param ignoreInsertedRows When set to true, we force an update/insert of daily_volume rows, even when they already exist
 * @param retry Retry mechanism
 */
export const addToQueue = async (
  startTime?: number | null,
  ignoreInsertedRows = true,
  retry = 0
) => {
  let dayBeginning = new Date();

  if (!startTime) {
    dayBeginning = new Date();
    dayBeginning.setUTCHours(0, 0, 0, 0);
    startTime = dayBeginning.getTime() / 1000 - 24 * 3600;
  }

  await queue.add(
    randomUUID(),
    {
      startTime,
      ignoreInsertedRows,
      retry,
    },
    {
      delay: retry ? retry ** 2 * 120 * 1000 : 0,
    }
  );
};
