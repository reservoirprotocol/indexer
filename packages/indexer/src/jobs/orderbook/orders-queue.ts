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
    concurrency: 50,
  });

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
          if (size >= 40000) {
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
      kind: "seaport-v1.4";
      info: orders.seaportV14.OrderInfo;
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
      kind: "rarible";
      info: orders.rarible.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "forward";
      info: orders.forward.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "infinity";
      info: orders.infinity.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "flow";
      info: orders.flow.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "blur";
      info: orders.blur.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "manifold";
      info: orders.manifold.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "element";
      info: orders.element.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    }
  | {
      kind: "nftx";
      info: orders.nftx.OrderInfo;
      relayToArweave?: boolean;
      validateBidValue?: boolean;
    };

export const jobProcessor = async (job: Job) => {
  const { kind, info, relayToArweave, validateBidValue } = job.data as GenericOrderInfo;

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

      case "forward": {
        result = await orders.forward.save([info]);
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

      case "looks-rare": {
        result = await orders.looksRare.save([info], relayToArweave);
        break;
      }

      case "seaport": {
        result = await orders.seaport.save([info], relayToArweave, validateBidValue);
        break;
      }

      case "sudoswap": {
        result = await orders.sudoswap.save([info]);
        break;
      }

      case "zeroex-v4": {
        result = await orders.zeroExV4.save([info], relayToArweave);
        break;
      }

      case "universe": {
        result = await orders.universe.save([info]);
        break;
      }

      case "rarible": {
        result = await orders.rarible.save([info], relayToArweave);
        break;
      }

      case "infinity": {
        result = await orders.infinity.save([info], relayToArweave);
        break;
      }

      case "flow": {
        result = await orders.flow.save([info as orders.flow.OrderInfo], relayToArweave);
        break;
      }

      case "blur": {
        result = await orders.blur.save([info], relayToArweave);
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
    }
  } catch (error) {
    logger.error(job.queueName, `Failed to process order ${JSON.stringify(job.data)}: ${error}`);
    throw error;
  }

  if (result.length && result[0].status === "delayed") {
    await addToQueue([job.data], false, result[0].delay);
  } else {
    logger.debug(job.queueName, `[${kind}] Order save result: ${JSON.stringify(result)}`);
  }
};

export const addToQueue = async (
  orderInfos: GenericOrderInfo[],
  prioritized = false,
  delay = 0
) => {
  await queue.addBulk(
    orderInfos.map((orderInfo) => ({
      name: randomUUID(),
      data: orderInfo,
      opts: {
        priority: prioritized ? 1 : undefined,
        delay: delay ? delay * 1000 : undefined,
      },
    }))
  );
};
