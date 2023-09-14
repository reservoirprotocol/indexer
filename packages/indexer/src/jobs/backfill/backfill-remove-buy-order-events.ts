/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { idb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "remove-buy-order-events-queue";

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
      const cursor = job.data.cursor as CursorInfo;

      const limit = 1;
      let continuationFilter = "";

      if (cursor) {
        continuationFilter = `AND (created_at, id) < (to_timestamp($/createdAt/), $/id/)`;
      }

      const buyOrders = await redb.manyOrNone(
        `
              SELECT extract(epoch from created_at) created_at, id
              FROM orders
              WHERE side = 'buy'
              ${continuationFilter}
              ORDER BY created_at DESC,id DESC
              LIMIT $/limit/;
          `,
        {
          createdAt: cursor?.createdAt,
          id: cursor?.id,
          limit,
        }
      );

      if (buyOrders?.length > 0) {
        await idb.none(
          `
            DELETE from order_events
            WHERE order_events.order_id IN ($/orderIds/)
          `,
          {
            orderIds: buyOrders.map((o) => o.id).join(","),
          }
        );

        if (_.size(buyOrders) == limit) {
          const lastBuyOrder = _.last(buyOrders);

          const nextCursor = {
            id: lastBuyOrder.id,
            createdAt: lastBuyOrder.created_at,
          };

          logger.info(
            QUEUE_NAME,
            `Iterated ${limit} records.  nextCursor=${JSON.stringify(nextCursor)}`
          );

          await addToQueue(nextCursor);
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type CursorInfo = {
  id: string;
  createdAt: string;
};

export const addToQueue = async (cursor?: CursorInfo) => {
  await queue.add(randomUUID(), { cursor });
};
