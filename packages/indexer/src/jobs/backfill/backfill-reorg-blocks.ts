/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import _ from "lodash";
import { isAfter } from "date-fns";
import { eventsSyncBackfillJob } from "@/jobs/events-sync/events-sync-backfill-job";

const QUEUE_NAME = "backfill-reorg-blocks";

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
      const limit = 100;
      let keepLooping = true;
      let blockFilter = "";

      while (keepLooping) {
        const results = await idb.manyOrNone(
          `
            select distinct on (block) block, created_at 
            from nft_transfer_events 
            where is_deleted = 1
            ${blockFilter}
            order by block desc
            limit $/limit/
          `,
          {
            limit,
          }
        );

        for (const { block } of results) {
          await eventsSyncBackfillJob.addToQueue(
            block,
            block + 10,
            {},
            {
              prioritized: 1,
            }
          );
        }

        if (results.length == limit) {
          const block = _.last(results);
          blockFilter = `AND block < ${block.block}`;

          if (!isAfter(new Date(block.created_at), new Date("2023-07-01"))) {
            keepLooping = false;
          }
        } else {
          keepLooping = false;
        }
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
