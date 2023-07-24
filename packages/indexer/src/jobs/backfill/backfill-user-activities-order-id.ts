/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-user-activities-order-id";

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
    async (job: Job) => {
      let cursor = job.data.cursor as CursorInfo;
      let continuationFilter = "";

      const limit = (await redis.get(`${QUEUE_NAME}-limit`)) || 1;

      if (!cursor) {
        const cursorJson = await redis.get(`${QUEUE_NAME}-next-cursor`);

        if (cursorJson) {
          cursor = JSON.parse(cursorJson);
        }
      }

      if (cursor) {
        continuationFilter = `WHERE (a.id) > ($/activityId/)`;
      }

      const results = await idb.manyOrNone(
        `
              UPDATE user_activities SET
                order_id = x.orderId
              FROM (
                SELECT a.id as activityId, a.metadata->>'orderId' as orderId
                FROM user_activities a
                ${continuationFilter}
                ORDER BY a.id
                LIMIT $/limit/
              ) x
              WHERE user_activities.id = x.activityId
              RETURNING user_activities.id
          `,
        {
          activityId: cursor?.activityId,
          limit,
        }
      );

      let nextCursor;

      if (results.length == limit) {
        const lastResult = _.last(results);

        nextCursor = {
          activityId: lastResult.id,
        };

        await redis.set(`${QUEUE_NAME}-next-cursor`, JSON.stringify(nextCursor));

        await addToQueue(nextCursor);
      }

      logger.info(
        QUEUE_NAME,
        `Processed ${results.length} activities.  limit=${limit}, cursor=${JSON.stringify(
          cursor
        )}, nextCursor=${JSON.stringify(nextCursor)}`
      );
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type CursorInfo = {
  activityId: number;
};

export const addToQueue = async (cursor?: CursorInfo) => {
  await queue.add(randomUUID(), { cursor }, { delay: 1000 });
};
