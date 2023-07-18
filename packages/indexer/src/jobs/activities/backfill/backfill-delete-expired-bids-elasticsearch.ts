import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { ActivityType } from "@/elasticsearch/indexes/activities/base";
import { randomUUID } from "crypto";
import { redb } from "@/common/db";

const QUEUE_NAME = "backfill-delete-expired-bids-elasticsearch-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    backoff: {
      type: "fixed",
      delay: 5000,
    },
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      job.data.addToQueue = false;

      const { cursor, dryRun } = job.data;

      if (cursor == null) {
        logger.info(QUEUE_NAME, `Backfill StartV2. jobData=${JSON.stringify(job.data)}`);
      }

      const limit = (await redis.get(`${QUEUE_NAME}-limit`)) || 3000;

      const { activities, continuation } = await ActivitiesIndex.search(
        {
          types: [ActivityType.bid],
          continuation: cursor,
          sortBy: "timestamp",
          limit: Number(limit),
        },
        true
      );

      if (activities.length > 0) {
        const orderIdToActivityId = Object.fromEntries(
          activities.map((activity) => [activity.order!.id, activity.id])
        );

        const orderIds = activities.map((activity) => activity.order!.id);

        const existingOrders = await redb.manyOrNone(
          `
            SELECT id from orders
            WHERE orders.id IN ($/orderIds:csv/)
          `,
          {
            orderIds,
          }
        );

        const existingOrderIds = existingOrders.map((existingOrder) => existingOrder.id);

        const toBeDeletedActivityIds = [];

        for (const orderId of orderIds) {
          if (!existingOrderIds.includes(orderId)) {
            toBeDeletedActivityIds.push(orderIdToActivityId[orderId]);
          }
        }

        if (toBeDeletedActivityIds.length && dryRun === 0) {
          logger.info(
            QUEUE_NAME,
            `Delete. jobData=${JSON.stringify(job.data)}, activitiesCount=${
              activities.length
            }, activitiesToBeDeletedCount=${
              toBeDeletedActivityIds.length
            }, lastActivity=${JSON.stringify(activities[0])} `
          );

          await ActivitiesIndex.deleteActivitiesById(toBeDeletedActivityIds);
        }

        if (continuation) {
          job.data.addToQueue = true;
          job.data.addToQueueCursor = continuation;
        }
      } else {
        logger.info(QUEUE_NAME, `Backfill End. jobData=${JSON.stringify(job.data)}`);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("completed", async (job) => {
    if (job.data.addToQueue) {
      await addToQueue(job.data.addToQueueCursor, job.data.dryRun);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire([`${QUEUE_NAME}-lock-v2`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await addToQueue(null, 0);
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async (cursor?: string | null, dryRun = 1, delay = 1000) => {
  await queue.add(randomUUID(), { cursor, dryRun }, { delay });
};
