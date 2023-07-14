import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import { config } from "@/config/index";
import { updateBlurRoyalties } from "@/utils/blur";
import { orderbookOrdersJob } from "@/jobs/orderbook/orderbook-orders-job";

export type BlurBidsRefreshJobPayload = {
  collection: string;
};

export class BlurBidsRefreshJob extends AbstractRabbitMqJobHandler {
  queueName = "blur-bids-refresh";
  maxRetries = 3;
  concurrency = 1;
  lazyMode = true;
  backoff = {
    type: "fixed",
    delay: 30000,
  } as BackoffStrategy;

  protected async process(payload: BlurBidsRefreshJobPayload) {
    const { collection } = payload;

    try {
      const pricePoints = await axios
        .get(`${config.orderFetcherBaseUrl}/api/blur-collection-bids?collection=${collection}`)
        .then((response) => response.data.bids as Sdk.Blur.Types.BlurBidPricePoint[]);

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
