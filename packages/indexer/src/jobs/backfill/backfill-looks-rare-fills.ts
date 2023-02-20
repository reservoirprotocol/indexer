/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as syncEventsUtils from "@/events-sync/utils";

const QUEUE_NAME = "backfill-looks-rare-fills";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { block, txHash } = job.data;

      const limit = 500;
      const result = await idb.manyOrNone(
        `
          SELECT
            fill_events_2.block,
            fill_events_2.tx_hash,
            fill_events_2.log_index,
            fill_events_2.batch_index,
            fill_events_2.order_side
          FROM fill_events_2
          WHERE (fill_events_2.block, fill_events_2.tx_hash) < ($/block/, $/txHash/)
            AND fill_events_2.order_kind = 'looks-rare'
          ORDER BY
            fill_events_2.block DESC,
            fill_events_2.tx_hash DESC
          LIMIT $/limit/
        `,
        { limit, block, txHash: toBuffer(txHash) }
      );

      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(
        ["tx_hash", "log_index", "batch_index", "order_side"],
        {
          table: "fill_events_2",
        }
      );
      for (const { tx_hash, log_index, batch_index, order_side } of result) {
        const tx = await syncEventsUtils.fetchTransaction(fromBuffer(tx_hash));
        // Fill any wrong "buy" fill events
        if (order_side === "buy" && tx.value !== "0") {
          values.push({
            tx_hash,
            log_index,
            batch_index,
            order_side: "sell",
          });
        }
      }

      if (values.length) {
        await idb.none(
          `
            UPDATE fill_events_2 SET
              order_side = x.order_side::order_side_t
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(tx_hash, log_index, batch_index, order_side)
            WHERE fill_events_2.tx_hash = x.tx_hash::BYTEA
              AND fill_events_2.log_index = x.log_index::INT
              AND fill_events_2.batch_index = x.batch_index::INT
          `
        );
      }

      if (result.length >= limit) {
        const lastResult = result[result.length - 1];
        await addToQueue(lastResult.block, fromBuffer(lastResult.tx_hash));
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  // !!! DISABLED

  // if (config.chainId === 1) {
  //   redlock
  //     .acquire([`${QUEUE_NAME}-lock-3`], 60 * 60 * 24 * 30 * 1000)
  //     .then(async () => {
  //       await addToQueue(14860000, HashZero);
  //     })
  //     .catch(() => {
  //       // Skip on any errors
  //     });
  // }
}

export const addToQueue = async (block: number, txHash: string) => {
  await queue.add(randomUUID(), { block, txHash });
};
