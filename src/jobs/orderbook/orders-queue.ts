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
      const { kind, info, relayToArweave, validateBidValue } = job.data as GenericOrderInfo;

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

          case "cryptopunks": {
            const result = await orders.cryptopunks.save([info as orders.cryptopunks.OrderInfo]);
            logger.info(QUEUE_NAME, `[cryptopunks] Order save result: ${JSON.stringify(result)}`);

            break;
          }

          case "zora-v3": {
            const result = await orders.zora.save([info as orders.zora.OrderInfo]);
            logger.info(QUEUE_NAME, `[zora-v3] Order save result: ${JSON.stringify(result)}`);
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

          case "seaport": {
            const result = await orders.seaport.save(
              [info as orders.seaport.OrderInfo],
              relayToArweave,
              validateBidValue
            );
            logger.info(QUEUE_NAME, `[seaport] Order save result: ${JSON.stringify(result)}`);

            break;
          }

          case "sudoswap": {
            const result = await orders.sudoswap.save([info as orders.sudoswap.OrderInfo]);
            logger.info(QUEUE_NAME, `[sudoswap] Order save result: ${JSON.stringify(result)}`);

            break;
          }

          case "zeroex-v4": {
            const result = await orders.zeroExV4.save(
              [info as orders.zeroExV4.OrderInfo],
              relayToArweave
            );
            logger.info(QUEUE_NAME, `[zeroex-v4] Order save result: ${JSON.stringify(result)}`);

            break;
          }

          case "universe": {
            const result = await orders.universe.save([info as orders.universe.OrderInfo]);
            logger.info(QUEUE_NAME, `[universe] Order save result: ${JSON.stringify(result)}`);

            break;
          }

          case "element": {
            const result = await orders.element.save(
              [info as orders.element.OrderInfo],
              relayToArweave
            );
            logger.info(QUEUE_NAME, `[element] Order save result: ${JSON.stringify(result)}`);

            break;
          }
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Failed to process order ${JSON.stringify(job.data)}: ${error}`);
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
      validateBidValue?: boolean;
    }
  | {
      kind: "zeroex-v4";
      info: orders.zeroExV4.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "foundation";
      info: orders.foundation.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "x2y2";
      info: orders.x2y2.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "seaport";
      info: orders.seaport.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "cryptopunks";
      info: orders.cryptopunks.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "zora-v3";
      info: orders.zora.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "sudoswap";
      info: orders.sudoswap.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "universe";
      info: orders.universe.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "element";
      info: orders.element.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
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
