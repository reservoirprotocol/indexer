import { Queue, QueueScheduler, Worker } from "bullmq";
import axios from "axios";
import cron from "node-cron";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

const QUEUE_NAME = "cancelx-sync";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 1,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 10000,
    removeOnFail: 10000,
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
      logger.info(QUEUE_NAME, "Fetching cancelx cancellations");

      // Fetch latest synced entry id
      const lastIdKey = "cancelx-last-id";
      let lastId = await redis.get(lastIdKey);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(["id", "fillability_status"], {
        table: "orders",
      });

      // Fetch the next entries
      let done = false;
      while (!done) {
        const { cancellations } = await axios
          .get(
            `https://cancelx-${
              config.chainId === 1 ? "production" : "development"
            }.up.railway.app/api/cancellations${lastId ? `?lastId=${lastId}` : ""}`
          )
          .then((response) => response.data);

        for (const { orderHash } of cancellations) {
          values.push({
            id: orderHash,
            fillability_status: "cancelled",
          });
        }

        const limit = 500;
        if (cancellations.length < limit) {
          done = true;
        }

        if (cancellations.length) {
          lastId = cancellations[cancellations.length - 1]._id;
        }
      }

      if (values.length) {
        await idb.none(
          `
            UPDATE orders SET
              fillability_status = 'cancelled',
              expiration = now(),
              updated_at = now()
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(id, fillability_status)
            WHERE orders.id = x.id::TEXT
          `
        );
      }

      await orderUpdatesById.addToQueue(
        values.map(
          ({ id }) =>
            ({
              context: `cancelx-cancellation-${id}`,
              id,
              trigger: { kind: "cancel" },
            } as orderUpdatesById.OrderInfo)
        )
      );

      logger.info(QUEUE_NAME, `Cancelled ${values.length} orders`);

      // Update the latest synced id
      if (lastId) {
        await redis.set(lastIdKey, lastId);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  const addToQueue = async () => queue.add(QUEUE_NAME, {});

  cron.schedule(
    // Every 10 seconds
    "*/10 * * * * *",
    async () =>
      await redlock
        .acquire(["cancelx-sync-lock"], (10 - 3) * 1000)
        .then(async () => {
          logger.info(QUEUE_NAME, "Syncing latest cancelx cancellations");
          await addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
