/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Sdk from "@reservoir0x/sdk";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-sales-currency-price";

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
    async (job) => {
      const { createdAt, txHash, logIndex, batchIndex } = job.data;
      const limit = 1000;

      const results = await idb.manyOrNone(
        `
          SELECT
            fill_events_2.tx_hash,
            fill_events_2.log_index,
            fill_events_2.batch_index,
            floor(extract('epoch' from fill_events_2.created_at)) AS created_at,
            fill_events_2.currency,
            fill_events_2.price,
            fill_events_2.currency_price
          FROM fill_events_2
          WHERE (
            fill_events_2.created_at,
            fill_events_2.tx_hash,
            fill_events_2.log_index,
            fill_events_2.batch_index
          ) < (
            to_timestamp($/createdAt/),
            $/txHash/,
            $/logIndex/,
            $/batchIndex/
          )
            AND fill_events_2.created_at > now() - interval '30 days'
          ORDER BY
            fill_events_2.created_at DESC,
            fill_events_2.tx_hash DESC,
            fill_events_2.log_index DESC,
            fill_events_2.batch_index DESC
          LIMIT $/limit/
        `,
        {
          limit,
          createdAt,
          txHash: toBuffer(txHash),
          logIndex,
          batchIndex,
        }
      );

      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(
        ["tx_hash", "log_index", "batch_index", "currency_price"],
        {
          table: "fill_events_2",
        }
      );
      for (const { tx_hash, log_index, batch_index, currency, currency_price, price } of results) {
        if (!currency_price) {
          if (
            fromBuffer(currency) === Sdk.Common.Addresses.Native[config.chainId] ||
            fromBuffer(currency) === Sdk.Common.Addresses.WNative[config.chainId]
          ) {
            values.push({
              tx_hash,
              log_index,
              batch_index,
              currency_price: price,
            });
          } else {
            logger.error(QUEUE_NAME, `Transaction ${fromBuffer(tx_hash)} needs a resync`);
          }
        }
      }

      if (values.length) {
        await idb.none(
          `
          UPDATE fill_events_2 SET
            currency_price = x.currency_price::NUMERIC(78, 0)
          FROM (
            VALUES ${pgp.helpers.values(values, columns)}
          ) AS x(tx_hash, log_index, batch_index, currency_price)
          WHERE fill_events_2.tx_hash = x.tx_hash::BYTEA
            AND fill_events_2.log_index = x.log_index::INT
            AND fill_events_2.batch_index = x.batch_index::INT
          `
        );
      }

      if (results.length >= limit) {
        const lastResult = results[results.length - 1];
        await addToQueue(
          lastResult.created_at,
          fromBuffer(lastResult.tx_hash),
          lastResult.log_index,
          lastResult.batch_index
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  createdAt: number,
  txHash: string,
  logIndex: number,
  batchIndex: number
) => {
  await queue.add(randomUUID(), { createdAt, txHash, logIndex, batchIndex });
};
