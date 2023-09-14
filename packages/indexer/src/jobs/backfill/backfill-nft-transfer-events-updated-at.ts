/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-nft-transfer-events-updated-at-queue";

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
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      let updateAtFilter = "";

      if (config.chainId === 1) {
        updateAtFilter = `
          WHERE updated_at <= '2023-06-27 13:03:01.118'
          AND updated_at >= '2023-06-27 13:03:01.116'
        `;
      } else if (config.chainId === 137) {
        updateAtFilter = `
          WHERE updated_at <= '2023-06-27 13:11:48.003'
          AND updated_at >= '2023-06-27 13:11:48.001'
        `;
      } else if (config.chainId === 10) {
        updateAtFilter = `
          WHERE updated_at <= '2023-06-27 13:08:38.464'
          AND updated_at >= '2023-06-27 13:08:38.462'
        `;
      }

      const limit = (await redis.get(`${QUEUE_NAME}-limit`)) || 2500;

      const results = await idb.manyOrNone(
        `
          WITH x AS (  
            SELECT
              nft_transfer_events.tx_hash,
              nft_transfer_events.log_index,
              nft_transfer_events.batch_index,
              nft_transfer_events.created_at
            FROM nft_transfer_events
            ${updateAtFilter}
            LIMIT $/limit/
          )
          UPDATE nft_transfer_events SET
              updated_at = COALESCE(x.created_at, NOW() - INTERVAL '30 DAYS')
          FROM x
          WHERE nft_transfer_events.tx_hash = x.tx_hash
          AND nft_transfer_events.log_index = x.log_index
          AND nft_transfer_events.batch_index = x.batch_index
          RETURNING x.tx_hash, x.log_index, x.batch_index
          `,
        {
          limit,
        }
      );

      if (results.length == limit) {
        job.data.addToQueue = true;
      }

      logger.info(QUEUE_NAME, `Processed ${results.length} nft transfer events. limit=${limit}`);
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("completed", async (job) => {
    if (job.data.addToQueue) {
      await addToQueue();
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {});
};
