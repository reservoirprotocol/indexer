/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import * as collectionUpdatesFloorAsk from "@/jobs/collection-updates/floor-queue";
import { fromBuffer } from "@/common/utils";

const QUEUE_NAME = "backfill-collections-non-flagged-floor-ask";

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
      const result = await idb.oneOrNone(
        `
        SELECT collections.id, token_sets_tokens.contract, token_sets_tokens.token_id FROM collections
        JOIN orders ON orders.id = collections.floor_sell_id
        JOIN token_sets_tokens ON orders.token_set_id = token_sets_tokens.token_set_id
        WHERE collections.floor_sell_id IS NOT NULL and collections.non_flagged_floor_sell_id IS NULL
        LIMIT 1
          `
      );

      if (result) {
        logger.info(QUEUE_NAME, `Backfilling collection. tokenSetResult=${JSON.stringify(result)}`);

        await collectionUpdatesFloorAsk.addToQueue([
          {
            kind: "bootstrap",
            contract: fromBuffer(result.contract),
            tokenId: result.token_id,
            txHash: null,
            txTimestamp: null,
          },
        ]);

        await addToQueue();
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire([`${QUEUE_NAME}-lock`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await addToQueue();
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {}, { delay: 1000 });
};
