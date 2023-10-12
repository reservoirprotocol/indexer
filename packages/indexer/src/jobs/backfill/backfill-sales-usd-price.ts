/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { getUSDAndNativePrices } from "@/utils/prices";

const QUEUE_NAME = "backfill-sales-usd-price";

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
      const { startTimestamp, endTimestamp, txHash, logIndex, batchIndex } = job.data;
      const limit = 1000;

      const results = await idb.manyOrNone(
        `
          SELECT
            fill_events_2.tx_hash,
            fill_events_2.log_index,
            fill_events_2.batch_index,
            fill_events_2.timestamp,
            fill_events_2.order_side,
            fill_events_2.currency,
            fill_events_2.price,
            fill_events_2.currency_price,
            fill_events_2.usd_price
          FROM fill_events_2
          WHERE (
            fill_events_2.timestamp,
            fill_events_2.tx_hash,
            fill_events_2.log_index,
            fill_events_2.batch_index
          ) < (
            $/endTimestamp/,
            $/txHash/,
            $/logIndex/,
            $/batchIndex/
          )
          AND fill_events_2.timestamp >= $/startTimestamp/
          ORDER BY
            fill_events_2.timestamp DESC,
            fill_events_2.tx_hash DESC,
            fill_events_2.log_index DESC,
            fill_events_2.batch_index DESC
          LIMIT $/limit/
        `,
        {
          limit,
          startTimestamp,
          endTimestamp,
          txHash: toBuffer(txHash),
          logIndex,
          batchIndex,
        }
      );

      // Fix 1: Set the currency of old bids to WETH instead of ETH
      // (since it was set to ETH by default for all sales)
      /*
      {
        const values: any[] = [];
        const columns = new pgp.helpers.ColumnSet(
          ["tx_hash", "log_index", "batch_index", "currency"],
          {
            table: "fill_events_2",
          }
        );
        for (const { tx_hash, log_index, batch_index, currency, order_side } of results) {
          if (
            fromBuffer(currency) === Sdk.Common.Addresses.Native[config.chainId] &&
            order_side === "buy"
          ) {
            values.push({
              tx_hash,
              log_index,
              batch_index,
              currency: toBuffer(Sdk.Common.Addresses.WNative[config.chainId]),
            });
          }
        }

        if (values.length) {
          await idb.none(
            `
            UPDATE fill_events_2 SET
              currency = x.currency::BYTEA
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(tx_hash, log_index, batch_index, currency)
            WHERE fill_events_2.tx_hash = x.tx_hash::BYTEA
              AND fill_events_2.log_index = x.log_index::INT
              AND fill_events_2.batch_index = x.batch_index::INT
          `
          );
        }
      }
      */

      // Fix 2: Set the USD price
      {
        const values: any[] = [];
        const columns = new pgp.helpers.ColumnSet(
          ["tx_hash", "log_index", "batch_index", "currency_price", "usd_price"],
          {
            table: "fill_events_2",
          }
        );
        for (const {
          tx_hash,
          log_index,
          batch_index,
          currency,
          price,
          usd_price,
          timestamp,
        } of results) {
          const prices = await getUSDAndNativePrices(fromBuffer(currency), price, timestamp, {
            onlyUSD: true,
          });
          if (!prices.usdPrice && getNetworkSettings().coingecko) {
            throw new Error("Missing USD price");
          }

          if (prices.usdPrice != usd_price) {
            values.push({
              tx_hash,
              log_index,
              batch_index,
              currency_price: price,
              usd_price: prices.usdPrice ?? null,
            });
          }
        }

        if (values.length) {
          await idb.none(
            `
              UPDATE fill_events_2 SET
                currency_price = x.currency_price::NUMERIC(78, 0),
                usd_price = x.usd_price::NUMERIC(78, 0)
              FROM (
                VALUES ${pgp.helpers.values(values, columns)}
              ) AS x(tx_hash, log_index, batch_index, currency_price, usd_price)
              WHERE fill_events_2.tx_hash = x.tx_hash::BYTEA
                AND fill_events_2.log_index = x.log_index::INT
                AND fill_events_2.batch_index = x.batch_index::INT
            `
          );
        }
      }

      if (results.length >= limit) {
        const lastResult = results[results.length - 1];
        await addToQueue(
          startTimestamp,
          lastResult.timestamp,
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
  startTimestamp: number,
  endTimestamp: number,
  txHash: string,
  logIndex: number,
  batchIndex: number
) => {
  await queue.add(randomUUID(), { startTimestamp, endTimestamp, txHash, logIndex, batchIndex });
};
