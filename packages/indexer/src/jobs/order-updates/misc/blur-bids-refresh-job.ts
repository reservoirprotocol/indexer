import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import cron from "node-cron";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMqJobsConsumer } from "@/jobs/index";
import { orderbookOrdersJob } from "@/jobs/orderbook/orderbook-orders-job";
import { updateBlurRoyalties } from "@/utils/blur";

export type BlurBidsRefreshJobPayload = {
  collection: string;
};

export default class BlurBidsRefreshJob extends AbstractRabbitMqJobHandler {
  queueName = "blur-bids-refresh";
  maxRetries = 3;
  concurrency = 1;
  backoff = {
    type: "fixed",
    delay: 30000,
  } as BackoffStrategy;

  public async process(payload: BlurBidsRefreshJobPayload) {
    const { collection } = payload;

    if (config.chainId !== 1) {
      return;
    }

    try {
      await axios
        .get(`${config.orderFetcherBaseUrl}/api/blur-collection-bids?collection=${collection}`)
        .then(async (response) => {
          const pricePoints = response.data.bids as Sdk.Blur.Types.BlurBidPricePoint[];
          await orderbookOrdersJob.addToQueue([
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
        })
        .catch(() => {
          // Skip any errors
        });

      await axios
        .get(
          `${config.orderFetcherBaseUrl}/api/blur-collection-trait-bids?collection=${collection}`
        )
        .then(async (response) => {
          const traitBids = response.data.bids as {
            attributeKey: string;
            attributeValue: string;
            bids: Sdk.Blur.Types.BlurBidPricePoint[];
          }[];

          for (const traitBid of traitBids) {
            await orderbookOrdersJob.addToQueue([
              {
                kind: "blur-bid",
                info: {
                  orderParams: {
                    collection,
                    attribute: {
                      key: traitBid.attributeKey,
                      value: traitBid.attributeValue,
                    },
                    pricePoints: traitBid.bids,
                  },
                  metadata: {},
                  fullUpdate: true,
                },
              },
            ]);
          }
        })
        .catch(() => {
          // Skip any errors
        });

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
        this.queueName,
        `Failed to refresh Blur bids for collection ${collection}: ${
          error?.response.data ? JSON.stringify(error.response.data) : error
        }`
      );
      throw error;
    }
  }

  public async addToQueue(collection: string, force = false) {
    await redis.set(`blur-collection-with-bids:${collection}`, "1", "EX", 24 * 3600);

    if (force) {
      await this.send({ payload: { collection } });
    } else {
      const delayInSeconds = 10 * 60;
      const halfDelayInSeconds = delayInSeconds / 2;

      await this.send(
        { payload: { collection }, jobId: collection },
        Math.floor(halfDelayInSeconds + Math.random() * halfDelayInSeconds) * 1000
      );
    }
  }
}

export const blurBidsRefreshJob = new BlurBidsRefreshJob();

if (config.chainId === 1 && config.doBackgroundWork) {
  // cron.schedule(
  //   // Every 10 minutes
  //   "*/10 * * * *",
  //   async () => {
  //     const keys = await redis.keys("blur-collection-with-bids:*");
  //     await Promise.all(keys.map((key) => blurBidsRefreshJob.addToQueue(key.split(":")[1])));
  //   }
  // );

  cron.schedule(
    // Every hour
    "*/60 * * * *",
    async () =>
      await redlock
        .acquire(["blur-bids-refresh-retry-lock"], (60 * 60 - 3) * 1000)
        .then(async () => {
          await RabbitMqJobsConsumer.retryQueue(blurBidsRefreshJob.queueName);
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
