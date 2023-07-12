/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { extractAttributionData } from "@/events-sync/utils";

const QUEUE_NAME = "backfill-fill-events-fill-source-queue";

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
      const { timestamp, logIndex, batchIndex } = job.data;

      const limit = 500;
      const result = await idb.manyOrNone(
        `
          SELECT
            fill_events_2.order_kind,
            fill_events_2.tx_hash,
            fill_events_2.log_index,
            fill_events_2.batch_index,
            fill_events_2.taker,
            fill_events_2.aggregator_source_id,
            fill_events_2.fill_source_id,
            fill_events_2.timestamp
          FROM fill_events_2
          WHERE (fill_events_2.timestamp, fill_events_2.log_index, fill_events_2.batch_index) < ($/timestamp/, $/logIndex/, $/batchIndex/)
          ORDER BY
            fill_events_2.timestamp DESC,
            fill_events_2.log_index DESC,
            fill_events_2.batch_index DESC
          LIMIT $/limit/
        `,
        { limit, timestamp, logIndex, batchIndex }
      );

      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(
        ["tx_hash", "log_index", "batch_index", "taker", "fill_source_id", "aggregator_source_id"],
        {
          table: "fill_events_2",
        }
      );
      for (const {
        tx_hash,
        log_index,
        batch_index,
        order_kind,
        taker,
        fill_source_id,
        aggregator_source_id,
      } of result) {
        if (!fill_source_id || !aggregator_source_id) {
          const txHash = fromBuffer(tx_hash);

          const data = await extractAttributionData(txHash, order_kind);

          let realTaker = taker;
          if (data.taker) {
            realTaker = taker;
          }

          values.push({
            tx_hash,
            log_index,
            batch_index,
            taker: realTaker,
            fill_source_id: data.fillSource?.id,
            aggregator_source_id: data.aggregatorSource?.id,
          });
        }
      }

      if (values.length) {
        await idb.none(
          `
            UPDATE fill_events_2 SET
              aggregator_source_id = x.aggregator_source_id::INT,
              fill_source_id = x.fill_source_id::INT,
              taker = x.taker::BYTEA
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(tx_hash, log_index, batch_index, taker, fill_source_id, aggregator_source_id)
            WHERE fill_events_2.tx_hash = x.tx_hash::BYTEA
              AND fill_events_2.log_index = x.log_index::INT
              AND fill_events_2.batch_index = x.batch_index::INT
          `
        );
      }

      if (result.length >= limit) {
        const lastResult = result[result.length - 1];
        await addToQueue(lastResult.timestamp, lastResult.log_index, lastResult.batch_index);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (timestamp: number, logIndex: number, batchIndex: number) => {
  await queue.add(randomUUID(), { timestamp, logIndex, batchIndex });
};
