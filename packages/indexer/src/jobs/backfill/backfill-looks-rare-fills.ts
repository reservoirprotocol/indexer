/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumber } from "@ethersproject/bignumber";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { takerAsk, takerBid } from "@/events-sync/data/looks-rare-v2";
import { getUSDAndNativePrices } from "@/utils/prices";

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

      const limit = 50;
      const result = await idb.manyOrNone(
        `
          SELECT
            fill_events_2.block,
            fill_events_2.tx_hash,
            fill_events_2.log_index,
            fill_events_2.batch_index,
            fill_events_2.timestamp,
            fill_events_2.order_side
          FROM fill_events_2
          WHERE (fill_events_2.block, fill_events_2.tx_hash) < ($/block/, $/txHash/)
            AND fill_events_2.order_kind = 'looks-rare-v2'
            AND fill_events_2.is_deleted = 0
          ORDER BY
            fill_events_2.block DESC,
            fill_events_2.tx_hash DESC
          LIMIT $/limit/
        `,
        { limit, block, txHash: toBuffer(txHash) }
      );

      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(
        ["tx_hash", "log_index", "batch_index", "price", "currency_price", "usd_price"],
        {
          table: "fill_events_2",
        }
      );
      for (const { tx_hash, log_index, batch_index, timestamp, order_side } of result) {
        try {
          const txReceipt = await baseProvider.getTransactionReceipt(fromBuffer(tx_hash));
          const log = txReceipt.logs.find((l) => l.logIndex === log_index)!;

          const parsedLog = (order_side === "sell" ? takerBid : takerAsk).abi.parseLog(log);

          const amount = parsedLog.args["amounts"][0].toString();
          const currency = parsedLog.args["currency"].toLowerCase();
          const currencyPrice = (parsedLog.args["feeAmounts"] as BigNumber[])
            .map((amount) => bn(amount))
            .reduce((a, b) => a.add(b))
            .div(amount)
            .toString();

          const priceData = await getUSDAndNativePrices(currency, currencyPrice, timestamp);

          values.push({
            tx_hash,
            log_index,
            batch_index,
            price: priceData.nativePrice,
            usd_price: priceData.usdPrice!,
            currency_price: currencyPrice,
          });
        } catch (error) {
          logger.info(QUEUE_NAME, JSON.stringify({ txHash: fromBuffer(tx_hash), result }));
          throw error;
        }
      }

      if (values.length) {
        await idb.none(
          `
            UPDATE fill_events_2 SET
              price = x.price::NUMERIC(78, 0),
              currency_price = x.currency_price::NUMERIC(78, 0),
              usd_price = x.usd_price::NUMERIC(78, 0),
              updated_at = now()
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(tx_hash, log_index, batch_index, price, currency_price, usd_price)
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
}

export const addToQueue = async (block: number, txHash: string) => {
  await queue.add(randomUUID(), { block, txHash });
};
