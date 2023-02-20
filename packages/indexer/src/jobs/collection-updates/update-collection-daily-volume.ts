import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { fromUnixTime, getUnixTime, add } from "date-fns";
import { DailyVolume } from "@/models/daily-volumes/daily-volume";

const QUEUE_NAME = "update-collection-daily-volume-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: true,
    removeOnFail: 50000,
    backoff: {
      type: "fixed",
      delay: 5000,
    },
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { newCollectionId, contract } = job.data;

      // Get the first sale date for the new collection
      const query = `
        SELECT timestamp
        FROM fill_events_2 fe
        WHERE contract = $/contract/
        AND token_id IN (
          SELECT token_id
          FROM tokens
          WHERE collection_id = $/newCollectionId/
        )
        ORDER by timestamp ASC
        LIMIT 1
      `;

      const result = await idb.oneOrNone(query, {
        newCollectionId,
        contract: toBuffer(contract),
      });

      if (result) {
        const currentTime = getUnixTime(new Date());
        let saleDate = fromUnixTime(result.timestamp);
        saleDate.setUTCHours(0, 0, 0, 0);

        // Recalculate daily volumes from the first sale date
        while (getUnixTime(saleDate) < currentTime - 24 * 60 * 60) {
          await DailyVolume.calculateDay(getUnixTime(saleDate), true, newCollectionId);
          logger.info(
            QUEUE_NAME,
            `Calculate daily volume for date ${saleDate.toISOString()} collection ${newCollectionId} `
          );
          saleDate = add(saleDate, { days: 1 });
          saleDate.setUTCHours(0, 0, 0, 0);
        }

        // Update the collections table
        const updated = await DailyVolume.updateCollections(true, newCollectionId);
        logger.info(QUEUE_NAME, `Updated collections table collection ${newCollectionId}`);

        if (updated) {
          logger.info(
            QUEUE_NAME,
            `Finished recalculating daily volumes for collection ${newCollectionId}`
          );
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 15 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  newCollectionId: string,
  contract: string,
  delay = 60 * 30 * 1000
) => {
  await queue.add(
    newCollectionId,
    { newCollectionId, contract },
    { jobId: newCollectionId, delay }
  );
};
