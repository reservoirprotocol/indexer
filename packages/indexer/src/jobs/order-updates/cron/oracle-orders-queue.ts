import axios from "axios";
import { Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

const QUEUE_NAME = "oracle-orders";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 1000,
    timeout: 5000,
  },
});
export let worker: Worker | undefined;

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  worker = new Worker(
    QUEUE_NAME,
    async () => {
      logger.info(QUEUE_NAME, "Fetching oracle cancellations");

      // Fetch the cursor
      const CURSOR_KEY = "oracle-orders-cursor";
      const cursor = await redis.get(CURSOR_KEY).then((c) => c || "0");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values: any[] = [];

      // Fetch any new cancellations
      const result = await axios.get(`?fromTimestamp=${cursor}`).then((response) => response.data);
      const cancellations = result.cancellations;
      for (const { orderHash } of cancellations) {
        values.push({ id: orderHash });
      }

      // Mark any relevant orders as cancelled
      const columns = new pgp.helpers.ColumnSet(["id"], {
        table: "orders",
      });
      if (values.length) {
        const updatedOrders = await idb.manyOrNone(
          `
            UPDATE orders SET
              fillability_status = 'cancelled',
              updated_at = now()
            FROM (VALUES ${pgp.helpers.values(values, columns)}) AS x(id)
            WHERE orders.id = x.id::TEXT
              AND orders.fillability_status != 'cancelled'
            RETURNING orders.id
          `
        );

        await orderUpdatesById.addToQueue(
          updatedOrders.map(
            ({ id }) =>
              ({
                context: `oracle-orders-check-${id}`,
                id,
                trigger: { kind: "cancel" },
              } as orderUpdatesById.OrderInfo)
          )
        );
      }

      // Update the cursor
      if (cancellations.length) {
        const newCursor = cancellations[cancellations.length - 1].timestamp;
        await redis.set(CURSOR_KEY, newCursor);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  const addToQueue = async () => queue.add(QUEUE_NAME, {});
  cron.schedule(
    // Every 5 seconds
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire(["oracle-orders-check-lock"], (5 - 3) * 1000)
        .then(async () => {
          logger.info(QUEUE_NAME, "Triggering oracle orders check");
          await addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
