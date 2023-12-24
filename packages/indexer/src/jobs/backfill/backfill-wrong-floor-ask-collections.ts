/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-wrong-floor-ask-collections-queue";

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
        SELECT collections.id FROM collections LEFT JOIN LATERAL (
          SELECT
            tokens.floor_sell_source_id_int,
            tokens.contract AS floor_sell_token_contract,
            tokens.token_id AS floor_sell_token_id,
            tokens.name AS floor_sell_token_name,
            tokens.image AS floor_sell_token_image,
            tokens.floor_sell_id,
            tokens.floor_sell_value,
            tokens.floor_sell_maker,
            tokens.floor_sell_valid_from,
            tokens.floor_sell_valid_to AS floor_sell_valid_until,
            tokens.floor_sell_currency,
            tokens.floor_sell_currency_value
          FROM tokens
          LEFT JOIN orders
            ON tokens.floor_sell_id = orders.id
          WHERE tokens.collection_id = collections.id
          ORDER BY tokens.floor_sell_value
          LIMIT 1
        ) y ON TRUE
        WHERE y.floor_sell_value IS NULL and collections.floor_sell_value IS NOT NULL
        LIMIT 1
          `
      );

      if (collection) {
        await idb.none(
          `
              UPDATE collections SET
                floor_sell_id = x.floor_sell_id,
                floor_sell_value = x.floor_sell_value,
                floor_sell_maker = x.floor_sell_maker,
                floor_sell_source_id_int = x.source_id_int,
                floor_sell_valid_between = x.valid_between,
                updated_at = now()
              FROM (
                WITH collection_floor_sell AS (
                    SELECT
                      tokens.floor_sell_id,
                      tokens.floor_sell_value,
                      tokens.floor_sell_maker,
                      orders.source_id_int,
                      orders.valid_between
                    FROM tokens
                    JOIN orders
                      ON tokens.floor_sell_id = orders.id
                    WHERE tokens.collection_id = $/collection/
                    ORDER BY tokens.floor_sell_value
                    LIMIT 1
                )
                SELECT
                    collection_floor_sell.floor_sell_id,
                    collection_floor_sell.floor_sell_value,
                    collection_floor_sell.floor_sell_maker,
                    collection_floor_sell.source_id_int,
                    collection_floor_sell.valid_between
                FROM collection_floor_sell
                UNION ALL
                SELECT NULL, NULL, NULL, NULL, NULL
                WHERE NOT EXISTS (SELECT 1 FROM collection_floor_sell)
              ) x
              WHERE collections.id = $/collection/
                AND (
                  collections.floor_sell_id IS DISTINCT FROM x.floor_sell_id
                  OR collections.floor_sell_value IS DISTINCT FROM x.floor_sell_value
                )
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
  await queue.add(randomUUID(), {});
};
