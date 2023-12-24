/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";

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

      await Promise.all(
        results.map(async (r) => {
          const block = await baseProvider.getBlock(r.number);
          values.push({ number, timestamp: block.timestamp });
        })
      );

      // Update related wrong timestamp data
      if (values.length) {
        await Promise.all([
          idb.none(`
            UPDATE nft_transfer_events SET
              timestamp = x.timestamp::INT
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(number, timestamp)
            WHERE nft_transfer_events.block = x.number::INT
              AND nft_transfer_events.timestamp != x.timestamp::INT
          `),
          idb.none(`
            UPDATE fill_events_2 SET
              timestamp = x.timestamp::INT,
              updated_at = now()
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(number, timestamp)
            WHERE fill_events_2.block = x.number::INT
              AND fill_events_2.timestamp != x.timestamp::INT
          `),
          idb.none(`
            UPDATE blocks SET
              timestamp = x.timestamp::INT
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(number, timestamp)
            WHERE blocks.number = x.number::INT
              AND blocks.timestamp != x.timestamp::INT
          `),
        ]);
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
}

export const addToQueue = async (number: number) => {
  await queue.add(randomUUID(), { number }, { jobId: number.toString() });
};
