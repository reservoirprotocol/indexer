/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { baseProvider } from "@/common/provider";

const QUEUE_NAME = "backfill-block-timestamps-queue";

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
      const { number } = job.data;
      const limit = 200;

      const results = await idb.manyOrNone(
        `
          SELECT
            blocks.number,
            blocks.timestamp
          FROM blocks
          WHERE blocks.number < $/number/
          ORDER BY blocks.number DESC
          LIMIT $/limit/
        `,
        {
          limit,
          number,
        }
      );

      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(["number", "timestamp"], {
        table: "blocks",
      });
      for (const { number, timestamp } of results) {
        if (!timestamp) {
          const block = await baseProvider.getBlock(number);
          values.push({ number, timestamp: block.timestamp });
        }
      }

      if (values.length) {
        await idb.none(
          `
            UPDATE blocks SET
              timestamp = x.timestamp::INT
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(number, timestamp)
            WHERE blocks.number = x.number
          `
        );
      }

      if (results.length >= limit) {
        const lastResult = results[results.length - 1];
        await addToQueue(lastResult.number);
      }
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
  //     await addToQueue(await baseProvider.getBlockNumber());
  //   })
  //   .catch(() => {
  //     // Skip on any errors
  //   });
}

export const addToQueue = async (number: number) => {
  await queue.add(randomUUID(), { number });
};
