/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";

import { config } from "@/config/index";
import { ridb } from "@/common/db";

import { addToQueue as addToQueueTransfers } from "@/jobs/elasticsearch/backfill-transfer-activities-elasticsearch";

const QUEUE_NAME = "backfill-activities-elasticsearch";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.doElasticsearchWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const query =
        "SELECT min(timestamp) AS min_timestamp, MAX(timestamp) AS max_timestamp from nft_transfer_events;";

      const timestamps = await ridb.oneOrNone(query);

      const start = new Date(timestamps.min_timestamp * 1000);
      const end = new Date(timestamps.max_timestamp * 1000);

      let loop = new Date(start);

      while (loop <= end) {
        const fromTimestamp = Math.floor(loop.getTime() / 1000);
        const newDate = loop.setDate(loop.getDate() + 1);
        const toTimestamp = Math.floor(newDate / 1000);

        await addToQueueTransfers(undefined, fromTimestamp, toTimestamp);

        loop = new Date(newDate);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {});
};
