import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import * as orders from "@/orderbook/orders";
import { addToQueue as addToQueueV2 } from "@/jobs/orderbook/orders-queue-v2";

const QUEUE_NAME = "orderbook-orders-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
    timeout: 30000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(QUEUE_NAME, async (job: Job) => jobProcessor(job), {
    connection: redis.duplicate(),
    concurrency: 70,
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  // Checks

  // Orders queue size
  cron.schedule(
    "*/1 * * * *",
    async () =>
      await redlock
        .acquire(["orders-queue-size-check-lock"], (60 - 5) * 1000)
        .then(async () => {
          const size = await queue.count();
          if (size >= 40000) {
            logger.error("orders-queue-size-check", `Orders queue buffering up: size=${size}`);
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );

  // Pending expired orders
  cron.schedule(
    "0 */2 * * *",
    async () =>
      await redlock
        .acquire(["pending-expired-orders-check-lock"], (2 * 3600 - 5) * 1000)
        .then(async () => {
          const result = await redb.oneOrNone(
            `
              SELECT
                count(*) AS expired_count
              FROM orders
              WHERE upper(orders.valid_between) < now()
                AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
            `
          );

          logger.info(
            "pending-expired-orders-check",
            JSON.stringify({ pendingExpiredOrdersCount: result.expired_count })
          );
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}

export type GenericOrderInfo =
  | {
      kind: "zeroex-v4";
      info: orders.zeroExV4.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "foundation";
      info: orders.foundation.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "x2y2";
      info: orders.x2y2.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "seaport";
      info: orders.seaport.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "seaport-v1.4";
      info: orders.seaportV14.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "seaport-v1.5";
      info: orders.seaportV15.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "cryptopunks";
      info: orders.cryptopunks.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "zora-v3";
      info: orders.zora.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "sudoswap";
      info: orders.sudoswap.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "universe";
      info: orders.universe.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "rarible";
      info: orders.rarible.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "flow";
      info: orders.flow.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "blur";
      info: orders.blur.ListingOrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "blur-bid";
      info: orders.blur.BidOrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "manifold";
      info: orders.manifold.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "element";
      info: orders.element.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "nftx";
      info: orders.nftx.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "superrare";
      info: orders.superrare.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    }
  | {
      kind: "looks-rare-v2";
      info: orders.looksRareV2.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
    };

export const jobProcessor = async (job: Job) => {
  const { kind, info, validateBidValue, ingestMethod } = job.data as GenericOrderInfo;

  let result: { status: string; delay?: number }[] = [];
  try {
    switch (kind) {
      case "x2y2": {
        result = await orders.x2y2.save([info]);
        break;
      }

      case "element": {
        result = await orders.element.save([info]);
        break;
      }

      case "foundation": {
        result = await orders.foundation.save([info]);
        break;
      }

      case "cryptopunks": {
        result = await orders.cryptopunks.save([info]);
        break;
      }

      case "zora-v3": {
        result = await orders.zora.save([info]);
        break;
      }

      case "seaport": {
        result = await orders.seaport.save([info], validateBidValue, ingestMethod);
        break;
      }

      case "seaport-v1.4": {
        result = await orders.seaportV14.save([info], validateBidValue, ingestMethod);
        break;
      }

      case "seaport-v1.5": {
        result = await orders.seaportV15.save([info], validateBidValue, ingestMethod);
        break;
      }

      case "sudoswap": {
        result = await orders.sudoswap.save([info]);
        break;
      }

      case "zeroex-v4": {
        result = await orders.zeroExV4.save([info]);
        break;
      }

      case "universe": {
        result = await orders.universe.save([info]);
        break;
      }

      case "rarible": {
        result = await orders.rarible.save([info]);
        break;
      }

      case "flow": {
        result = await orders.flow.save([info]);
        break;
      }

      case "blur": {
        result = await orders.blur.saveListings([info], ingestMethod);
        break;
      }

      case "blur-bid": {
        result = await orders.blur.saveBids([info], ingestMethod);
        break;
      }

      case "manifold": {
        result = await orders.manifold.save([info]);
        break;
      }

      case "nftx": {
        result = await orders.nftx.save([info]);
        break;
      }

      case "superrare": {
        result = await orders.superrare.save([info]);
        break;
      }

      case "looks-rare-v2": {
        result = await orders.looksRareV2.save([info]);
        break;
      }
    }
  } catch (error) {
    logger.error(job.queueName, `Failed to process order ${JSON.stringify(job.data)}: ${error}`);
    throw error;
  }

  logger.debug(job.queueName, `[${kind}] Order save result: ${JSON.stringify(result)}`);
};

export const addToQueue = async (
  orderInfos: GenericOrderInfo[],
  prioritized = false,
  delay = 0,
  jobId?: string
) => addToQueueV2(orderInfos, prioritized, delay, jobId);
