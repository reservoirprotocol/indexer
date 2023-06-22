import * as Sdk from "@reservoir0x/sdk";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as orderbook from "@/jobs/orderbook/orders-queue";
import * as blurBidsRefresh from "@/jobs/order-updates/misc/blur-bids-refresh";

const QUEUE_NAME = "blur-bids-buffer";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 20,
    backoff: {
      type: "fixed",
      delay: 30000,
    },
    removeOnComplete: 0,
    removeOnFail: 10000,
    timeout: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

const getCacheKey = (collection: string) => `blur-bid-incoming-price-points:${collection}`;

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { collection } = job.data as { collection: string };

      try {
        // This is not 100% atomic or consistent but it covers most scenarios
        const result = await redis.hvals(getCacheKey(collection));
        if (result.length) {
          await redis.del(getCacheKey(collection));

          const pricePoints = result.map((r) => JSON.parse(r));
          if (pricePoints.length) {
            await orderbook.addToQueue([
              {
                kind: "blur-bid",
                info: {
                  orderParams: {
                    collection,
                    pricePoints,
                  },
                  metadata: {},
                },
                ingestMethod: "websocket",
              },
            ]);
            await blurBidsRefresh.addToQueue(collection);
          }
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle buffered Blur bid updates for collection ${collection}: ${error}`
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

export const addToQueue = async (
  collection: string,
  pricePoints: Sdk.Blur.Types.BlurBidPricePoint[]
) => {
  await redis.hset(
    getCacheKey(collection),
    ...pricePoints.map((pp) => [pp.price, JSON.stringify(pp)]).flat()
  );

  await queue.add(
    collection,
    { collection },
    {
      jobId: collection,
      delay: 30 * 1000,
    }
  );
};
