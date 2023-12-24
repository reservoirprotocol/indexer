/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as syncEventsUtils from "@/events-sync/utils";

const QUEUE_NAME = "backfill-transaction-block-fields-queue";

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
      const { hash } = job.data;
      const limit = 200;

      const results = await idb.manyOrNone(
        `
          SELECT
            transactions.hash,
            transactions.block_timestamp
          FROM transactions
          WHERE transactions.hash < $/hash/
          ORDER BY transactions.hash DESC
          LIMIT $/limit/
        `,
        {
          limit,
          hash: toBuffer(hash),
        }
      );

      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(["hash", "block_number", "block_timestamp"], {
        table: "transactions",
      });
      for (const { hash, block_timestamp } of results) {
        if (!block_timestamp) {
          const tx = await baseProvider.getTransaction(fromBuffer(hash));
          if (tx) {
            values.push({
              hash,
              block_number: tx.blockNumber!,
              block_timestamp: (await syncEventsUtils.fetchBlock(tx.blockNumber!)).timestamp,
            });
          }
        }
      }

      if (values.length) {
        await idb.none(
          `
            UPDATE transactions SET
              block_number = x.block_number::INT,
              block_timestamp = x.block_timestamp::INT
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(hash, block_number, block_timestamp)
            WHERE transactions.hash = x.hash::BYTEA
          `
        );
      }

      if (results.length >= limit) {
        const lastResult = results[results.length - 1];
        await addToQueue(fromBuffer(lastResult.hash));
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (hash: string) => {
  await queue.add(randomUUID(), { hash });
};
