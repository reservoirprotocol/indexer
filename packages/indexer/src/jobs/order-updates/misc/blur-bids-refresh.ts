import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as orderbook from "@/jobs/orderbook/orders-queue";
import { updateBlurRoyalties } from "@/utils/blur";

const QUEUE_NAME = "blur-bids-refresh";

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

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { collection } = job.data as { collection: string };

      try {
        const pricePoints = await axios
          .get(`${config.orderFetcherBaseUrl}/api/blur-collection-bids?collection=${collection}`)
          .then((response) => response.data.bids as Sdk.Blur.Types.BlurBidPricePoint[]);

        await orderbook.addToQueue([
          {
            kind: "blur-bid",
            info: {
              orderParams: {
                collection,
                pricePoints,
              },
              metadata: {},
              fullUpdate: true,
            },
          },
        ]);

        // Also refresh the royalties
        const lockKey = `blur-royalties-refresh-lock:${collection}`;
        const lock = await redis.get(lockKey);
        if (!lock) {
          await redis.set(lockKey, "locked", "EX", 3600 - 5);
          await updateBlurRoyalties(collection);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        logger.error(
          QUEUE_NAME,
          `Failed to refresh Blur bids for collection ${collection}: ${
            error?.response.data ? JSON.stringify(error.response.data) : error
          }`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (collection: string, force = false) => {
  if (force) {
    await queue.add(collection, { collection });
  } else {
    const delayInSeconds = 10 * 60;
    const halfDelayInSeconds = delayInSeconds / 2;

    // At most one job per collection per `delayInSeconds` seconds
    const lockKey = `blur-bids-refresh-lock:${collection}`;
    const lock = await redis.get(lockKey);
    if (!lock) {
      await redis.set(lockKey, "locked", "EX", delayInSeconds - 1);
      await queue.add(
        collection,
        { collection },
        {
          jobId: collection,
          // Each job is randomly delayed so as to avoid too many concurrent requests
          delay: Math.floor(halfDelayInSeconds + Math.random() * halfDelayInSeconds) * 1000,
        }
      );
    }
  }
};
