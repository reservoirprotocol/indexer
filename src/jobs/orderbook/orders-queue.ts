import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import cron from "node-cron";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import * as orders from "@/orderbook/orders";

const QUEUE_NAME = "orderbook-orders-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 10000,
    removeOnFail: 10000,
    timeout: 30000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { kind, info, relayToArweave } = job.data as GenericOrderInfo;

      try {
        switch (kind) {
          case "x2y2": {
            const result = await orders.x2y2.save([info as orders.x2y2.OrderInfo]);
            logger.info(QUEUE_NAME, `[x2y2] Order save result: ${JSON.stringify(result)}`);

            break;
          }

          case "foundation": {
            const result = await orders.foundation.save([info as orders.foundation.OrderInfo]);
            logger.info(QUEUE_NAME, `[foundation] Order save result: ${JSON.stringify(result)}`);

            break;
          }

          case "looks-rare": {
            const result = await orders.looksRare.save(
              [info as orders.looksRare.OrderInfo],
              relayToArweave
            );
            logger.info(QUEUE_NAME, `[looks-rare] Order save result: ${JSON.stringify(result)}`);

            break;
          }

          case "opendao": {
            const result = await orders.openDao.save(
              [info as orders.openDao.OrderInfo],
              relayToArweave
            );
            logger.info(QUEUE_NAME, `[opendao] Order save result: ${JSON.stringify(result)}`);

            break;
          }

          case "seaport": {
            const result = await orders.seaport.save(
              [info as orders.seaport.OrderInfo],
              relayToArweave
            );
            logger.info(QUEUE_NAME, `[seaport] Order save result: ${JSON.stringify(result)}`);

            break;
          }

          case "zeroex-v4": {
            const result = await orders.openDao.save(
              [info as orders.zeroExV4.OrderInfo],
              relayToArweave
            );
            logger.info(QUEUE_NAME, `[zeroex-v4] Order save result: ${JSON.stringify(result)}`);

            break;
          }
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Failed to process order ${job.data}: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 30 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  // Every minute we check the size of the orders queue. This will
  // ensure we get notified when it's buffering up and potentially
  // blocking the real-time flow of orders.
  cron.schedule(
    "*/1 * * * *",
    async () =>
      await redlock
        .acquire(["orders-queue-size-check-lock"], (60 - 5) * 1000)
        .then(async () => {
          const size = await queue.count();
          if (size >= 10000) {
            logger.error("orders-queue-size-check", `Orders queue buffering up: size=${size}`);
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}

export type GenericOrderInfo =
  | {
      kind: "looks-rare";
      info: orders.looksRare.OrderInfo;
      relayToArweave?: boolean;
    }
  | {
      kind: "opendao";
      info: orders.openDao.OrderInfo;
      relayToArweave?: boolean;
    }
  | {
      kind: "zeroex-v4";
      info: orders.zeroExV4.OrderInfo;
      relayToArweave?: boolean;
    }
  | {
      kind: "foundation";
      info: orders.foundation.OrderInfo;
      relayToArweave?: boolean;
    }
  | {
      kind: "x2y2";
      info: orders.x2y2.OrderInfo;
      relayToArweave?: boolean;
    }
  | {
      kind: "seaport";
      info: orders.seaport.OrderInfo;
      relayToArweave?: boolean;
    };

export const addToQueue = async (orderInfos: GenericOrderInfo[], prioritized = false) => {
  await queue.addBulk(
    orderInfos.map((orderInfo) => ({
      name: randomUUID(),
      data: orderInfo,
      opts: {
        priority: prioritized ? 1 : undefined,
      },
    }))
  );
};
