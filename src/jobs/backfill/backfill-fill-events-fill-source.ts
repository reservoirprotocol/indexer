/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis, redlock } from "@/common/redis";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as transactionsModel from "@/models/transactions";

const QUEUE_NAME = "backfill-fill-events-fill-source-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 10000,
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

      const limit = 200;
      const result = await idb.manyOrNone(
        `
          SELECT
            fill_events_2.tx_hash,
            fill_events_2.log_index,
            fill_events_2.batch_index,
            fill_events_2.fill_source,
            fill_events_2.timestamp,
            fill_events_2.block
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

      let routerToFillSource: { [address: string]: string } = {};
      if (Sdk.Common.Addresses.Routers[config.chainId]) {
        routerToFillSource = Sdk.Common.Addresses.Routers[config.chainId];
      }

      const distinctBlocks = new Set<number>();
      for (const { block } of result) {
        distinctBlocks.add(block);
      }
      for (const block of distinctBlocks.values()) {
        const b = await baseProvider.getBlockWithTransactions(block);

        // Save all transactions within the block
        const limit = pLimit(20);
        await Promise.all(
          b.transactions.map((tx) =>
            limit(async () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const rawTx = tx.raw as any;

              const gasPrice = tx.gasPrice?.toString();
              const gasUsed = rawTx?.gas ? bn(rawTx.gas).toString() : undefined;
              const gasFee = gasPrice && gasUsed ? bn(gasPrice).mul(gasUsed).toString() : undefined;

              await transactionsModel.saveTransaction({
                hash: tx.hash.toLowerCase(),
                from: tx.from.toLowerCase(),
                to: (tx.to || AddressZero).toLowerCase(),
                value: tx.value.toString(),
                data: tx.data.toLowerCase(),
                blockNumber: b.number,
                blockTimestamp: b.timestamp,
                gasPrice,
                gasUsed,
                gasFee,
              });
            })
          )
        );
      }

      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(
        ["tx_hash", "log_index", "batch_index", "taker", "fill_source"],
        {
          table: "fill_events_2",
        }
      );
      for (const { tx_hash, log_index, batch_index, fill_source } of result) {
        if (!fill_source) {
          const tx = await transactionsModel.getTransaction(fromBuffer(tx_hash));
          if (routerToFillSource[tx.to]) {
            values.push({
              tx_hash,
              log_index,
              batch_index,
              fill_source: routerToFillSource[tx.to],
              taker: toBuffer(tx.from),
            });
          }
        }
      }

      if (values.length) {
        await idb.none(
          `
            UPDATE fill_events_2 SET
              fill_source = x.fill_source::fill_source_t,
              taker = x.taker::BYTEA
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(tx_hash, log_index, batch_index, taker, fill_source)
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

  redlock
    .acquire([`${QUEUE_NAME}-lock-5`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await addToQueue(Math.floor(Date.now() / 1000), 0, 0);
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async (timestamp: number, logIndex: number, batchIndex: number) => {
  await queue.add(randomUUID(), { timestamp, logIndex, batchIndex });
};
