/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
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
      let cursor = job.data.cursor as CursorInfo;
      let continuationFilter = "";

      const limit = (await redis.get(`${QUEUE_NAME}-limit`)) || 2500;

      if (!cursor) {
        const cursorJson = await redis.get(`${QUEUE_NAME}-next-cursor`);

        if (cursorJson) {
          cursor = JSON.parse(cursorJson);
        }
      }

      if (cursor) {
        continuationFilter = `WHERE (nft_transfer_events.tx_hash, nft_transfer_events.log_index, nft_transfer_events.batch_index) > ($/txHash/, $/logIndex/, $/batchIndex/)`;
      }

      const results = await idb.manyOrNone(
        `
          WITH x AS (  
            SELECT
              nft_transfer_events.tx_hash,
              nft_transfer_events.log_index,
              nft_transfer_events.batch_index,
              nft_transfer_events.created_at
            FROM nft_transfer_events
            ${continuationFilter}
            ORDER BY nft_transfer_events.tx_hash, nft_transfer_events.log_index, nft_transfer_events.batch_index
            LIMIT $/limit/
          )
          UPDATE nft_transfer_events SET
              updated_at = COALESCE(x.created_at, updated_at)
          FROM x
          WHERE nft_transfer_events.tx_hash = x.tx_hash
          AND nft_transfer_events.log_index = x.log_index
          AND nft_transfer_events.batch_index = x.batch_index
          RETURNING x.tx_hash, x.log_index, x.batch_index
          `,
        {
          txHash: cursor?.txHash ? toBuffer(cursor.txHash) : null,
          logIndex: cursor?.logIndex,
          batchIndex: cursor?.batchIndex,
          limit,
        }
      );

      if (results.length == limit) {
        const lastResult = _.last(results);

        const nextCursor = {
          txHash: fromBuffer(lastResult.tx_hash),
          logIndex: lastResult.log_index,
          batchIndex: lastResult.batch_index,
        };

        await redis.set(`${QUEUE_NAME}-next-cursor`, JSON.stringify(nextCursor));

        await addToQueue(nextCursor);
      }

      logger.info(
        QUEUE_NAME,
        `Processed ${results.length} nft transfer events. limit=${limit}, cursor=${JSON.stringify(
          cursor
        )}`
      );
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  // !!! DISABLED

  // redlock
  //   .acquire([`${QUEUE_NAME}-lock`], 60 * 60 * 24 * 30 * 1000)
  //   .then(async () => {
  //     await addToQueue();
  //   })
  //   .catch(() => {
  //     // Skip on any errors
  //   });
}

export type CursorInfo = {
  txHash: string;
  logIndex: number;
  batchIndex: number;
};

export const addToQueue = async (cursor?: CursorInfo) => {
  await queue.add(randomUUID(), { cursor }, { delay: 1000 });
};
