import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import _ from "lodash";
import cron from "node-cron";

import { ridb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import * as orders from "@/orderbook/orders";
import * as backfillExpiredOrders from "@/jobs/backfill/backfill-expired-orders";
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
    "0 */1 * * *",
    async () =>
      await redlock
        .acquire(["pending-expired-orders-check-lock"], (3600 - 5) * 1000)
        .then(async () => {
          const result = await ridb.oneOrNone(
            `
              SELECT
                count(*) AS expired_count,
                extract(epoch from min(upper(orders.valid_between))) AS min_timestamp
              FROM orders
              WHERE upper(orders.valid_between) < now()
                AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
            `
          );

          const currentTime = now();
          if (currentTime - Number(result.min_timestamp) >= 60) {
            await backfillExpiredOrders.addToQueue(
              _.range(0, currentTime - result.min_timestamp + 1).map((s) => currentTime - s)
            );
          }

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
      ingestDelay?: number;
    }
  | {
      kind: "foundation";
      info: orders.foundation.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "x2y2";
      info: orders.x2y2.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "seaport";
      info: orders.seaport.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "seaport-v1.4";
      info: orders.seaportV14.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "seaport-v1.5";
      info: orders.seaportV15.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "cryptopunks";
      info: orders.cryptopunks.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "zora-v3";
      info: orders.zora.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "sudoswap";
      info: orders.sudoswap.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "universe";
      info: orders.universe.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "rarible";
      info: orders.rarible.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "flow";
      info: orders.flow.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "blur";
      info: orders.blur.FullListingOrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "blur-listing";
      info: orders.blur.PartialListingOrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "blur-bid";
      info: orders.blur.PartialBidOrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "manifold";
      info: orders.manifold.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "element";
      info: orders.element.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "nftx";
      info: orders.nftx.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "superrare";
      info: orders.superrare.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "looks-rare-v2";
      info: orders.looksRareV2.OrderInfo;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "collectionxyz";
      info: orders.collectionxyz.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    }
  | {
      kind: "sudoswap-v2";
      info: orders.sudoswapV2.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
      ingestMethod?: "websocket" | "rest";
      ingestDelay?: number;
    };

export const jobProcessor = async (job: Job) => {
  const { kind, info, validateBidValue, ingestMethod, ingestDelay } = job.data as GenericOrderInfo;

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
        result = await orders.seaportV14.save([info], validateBidValue, ingestMethod, ingestDelay);
        break;
      }

      case "seaport-v1.5": {
        result = await orders.seaportV15.save([info], validateBidValue, ingestMethod, ingestDelay);
        break;
      }

      case "sudoswap": {
        result = await orders.sudoswap.save([info]);
        break;
      }

      case "sudoswap-v2": {
        result = await orders.sudoswapV2.save([info]);
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
        result = await orders.blur.saveFullListings([info], ingestMethod);
        break;
      }

      case "blur-listing": {
        result = await orders.blur.savePartialListings([info], ingestMethod);
        break;
      }

      case "blur-bid": {
        result = await orders.blur.savePartialBids([info], ingestMethod);
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

      case "collectionxyz": {
        result = await orders.collectionxyz.save([info]);
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
