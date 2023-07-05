import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

const QUEUE_NAME = "opensea-off-chain-cancellations";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 10000,
    removeOnFail: 10000,
    timeout: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { orderId } = job.data as { orderId: string };

      logger.debug(QUEUE_NAME, JSON.stringify({ orderId }));

      try {
        const result = await idb.oneOrNone(
          `
            UPDATE orders SET
              fillability_status = 'cancelled',
              updated_at = now()
            WHERE orders.id = $/id/
              AND orders.fillability_status = 'fillable'
              AND orders.approval_status = 'approved'
            RETURNING orders.id
          `,
          { id: orderId }
        );

        if (result) {
          await orderUpdatesById.addToQueue([
            {
              context: `cancel-${orderId}`,
              id: orderId,
              trigger: {
                kind: "cancel",
              },
            } as orderUpdatesById.OrderInfo,
          ]);
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle OpenSea order invalidation info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 30 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (orderId: string) => {
  await queue.add(
    orderId,
    { orderId },
    {
      jobId: orderId,
      // Delay for 5 seconds to allow any on-chain events to get processed first
      // (OpenSea doesn't return the invalidation reason and we only want to add
      // custom logic for off-chain cancellations)
      delay: 5 * 1000,
    }
  );
};
