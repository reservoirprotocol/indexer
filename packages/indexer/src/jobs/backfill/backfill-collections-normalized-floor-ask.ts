/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-collections-normalized-floor-ask";

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
    async () => {
      const collection = await idb.oneOrNone(
        `
        SELECT collections.id FROM collections
        WHERE collections.floor_sell_id IS NOT NULL and collections.normalized_floor_sell_id IS NULL
        LIMIT 1
          `
      );

      if (collection) {
        logger.info(QUEUE_NAME, `Backfilling collection. collection=${collection.id}`);

        await idb.none(
          `
              UPDATE collections SET
                normalized_floor_sell_id = x.normalized_floor_sell_id,
                normalized_floor_sell_value = x.normalized_floor_sell_value,
                normalized_floor_sell_maker = x.normalized_floor_sell_maker,
                normalized_floor_sell_source_id_int = x.source_id_int,
                normalized_floor_sell_valid_between = x.valid_between,
                updated_at = now()
              FROM (
                WITH collection_normalized_floor_sell AS (
                    SELECT
                      tokens.normalized_floor_sell_id,
                      tokens.normalized_floor_sell_value,
                      tokens.normalized_floor_sell_maker,
                      orders.source_id_int,
                      orders.valid_between
                    FROM tokens
                    JOIN orders ON tokens.normalized_floor_sell_id = orders.id
                    WHERE tokens.collection_id = $/collection/
                    ORDER BY tokens.normalized_floor_sell_value
                    LIMIT 1
                )
                SELECT
                    collection_normalized_floor_sell.normalized_floor_sell_id,
                    collection_normalized_floor_sell.normalized_floor_sell_value,
                    collection_normalized_floor_sell.normalized_floor_sell_maker,
                    collection_normalized_floor_sell.source_id_int,
                    collection_normalized_floor_sell.valid_between
                FROM collection_normalized_floor_sell
                UNION ALL
                SELECT NULL, NULL, NULL, NULL, NULL
                WHERE NOT EXISTS (SELECT 1 FROM collection_normalized_floor_sell)
              ) x
              WHERE collections.id = $/collection/
          `,
          {
            collection: collection.id,
          }
        );

        await addToQueue();
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {}, { delay: 500 });
};
