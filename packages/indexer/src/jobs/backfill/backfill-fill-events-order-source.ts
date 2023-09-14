/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-fill-events-order-source-queue";

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

      const limit = (await redis.get(`${QUEUE_NAME}-limit`)) || 500;

      if (!cursor) {
        const cursorJson = await redis.get(`${QUEUE_NAME}-next-cursor`);

        if (cursorJson) {
          cursor = JSON.parse(cursorJson);
        }
      }

      if (cursor) {
        continuationFilter = `WHERE (fill_events_2.created_at, fill_events_2.tx_hash, fill_events_2.log_index, fill_events_2.batch_index) > (to_timestamp($/createdAt/), $/txHash/, $/logIndex/, $/batchIndex/)`;
      }

      const results = await idb.manyOrNone(
        `
          WITH x AS (  
          SELECT
            fill_events_2.tx_hash,
            fill_events_2.log_index,
            fill_events_2.batch_index,
            extract(epoch from fill_events_2.created_at) created_at,
            fill_events_2.order_kind,
            CASE
                  WHEN (o.source_id_int IS NOT NULL) THEN o.source_id_int
                  WHEN (o.source_id_int IS NULL AND fill_events_2.order_kind = 'x2y2') THEN 17
                  WHEN (o.source_id_int IS NULL AND fill_events_2.order_kind = 'foundation') THEN 12
                  WHEN (o.source_id_int IS NULL AND fill_events_2.order_kind = 'looks-rare') THEN 3
                  WHEN (o.source_id_int IS NULL AND fill_events_2.order_kind = 'seaport') THEN 1
                  WHEN (o.source_id_int IS NULL AND fill_events_2.order_kind = 'wyvern-v2') THEN 1
                  WHEN (o.source_id_int IS NULL AND fill_events_2.order_kind = 'wyvern-v2.3') THEN 1
                  ELSE NULL
             END AS order_source_id_int
          FROM fill_events_2
          LEFT JOIN LATERAL (
            SELECT source_id_int
            FROM orders
            WHERE orders.id = fill_events_2.order_id
          ) o ON TRUE
          ${continuationFilter}
          ORDER BY fill_events_2.created_at, fill_events_2.tx_hash, fill_events_2.log_index, fill_events_2.batch_index
          LIMIT $/limit/
          )
          UPDATE fill_events_2 SET
              order_source_id_int = x.order_source_id_int
          FROM x
          WHERE fill_events_2.tx_hash = x.tx_hash
          AND fill_events_2.log_index = x.log_index
          AND fill_events_2.batch_index = x.batch_index
          RETURNING x.created_at, x.tx_hash, x.log_index, x.batch_index
          `,
        {
          createdAt: cursor?.createdAt,
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
          createdAt: lastResult.created_at,
        };

        await redis.set(`${QUEUE_NAME}-next-cursor`, JSON.stringify(nextCursor));

        await addToQueue(nextCursor);
      }

      logger.info(
        QUEUE_NAME,
        `Processed ${results.length} fill events.  limit=${limit}, cursor=${JSON.stringify(cursor)}`
      );
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type CursorInfo = {
  txHash: string;
  logIndex: number;
  batchIndex: number;
  createdAt: string;
};

export const addToQueue = async (cursor?: CursorInfo) => {
  await queue.add(randomUUID(), { cursor }, { delay: 1000 });
};
