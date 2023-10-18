import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { blurBidsRefreshJob } from "@/jobs/order-updates/misc/blur-bids-refresh-job";
import { orderbookOrdersJob } from "@/jobs/orderbook/orderbook-orders-job";

export type BlurBidsBufferJobPayload = {
  collection: string;
};

export default class BlurBidsBufferJob extends AbstractRabbitMqJobHandler {
  queueName = "blur-bids-buffer";
  maxRetries = 20;
  concurrency = 30;
  lazyMode = true;
  backoff = {
    type: "fixed",
    delay: 30000,
  } as BackoffStrategy;

  protected async process(payload: BlurBidsBufferJobPayload) {
    const { collection } = payload;

    if (config.chainId !== 1) {
      return;
    }

    try {
      // This is not 100% atomic or consistent but it covers most scenarios
      const result = await redis.hvals(this.getCacheKey(collection));
      if (result.length) {
        await redis.del(this.getCacheKey(collection));

        const pricePoints = result.map((r) => JSON.parse(r));
        if (pricePoints.length) {
          await orderbookOrdersJob.addToQueue([
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
          await blurBidsRefreshJob.addToQueue(collection);
        }
      }
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to handle buffered Blur bid updates for collection ${collection}: ${error}`
      );
      throw error;
    }
  }

  public getCacheKey(collection: string) {
    return `blur-bid-incoming-price-points:${collection}`;
  }

  public async addToQueue(collection: string, pricePoints: Sdk.Blur.Types.BlurBidPricePoint[]) {
    await redis.hset(
      this.getCacheKey(collection),
      ...pricePoints.map((pp) => [pp.price, JSON.stringify(pp)]).flat()
    );

    await this.send({ payload: { collection }, jobId: collection }, 30 * 1000);
  }
}

export const blurBidsBufferJob = new BlurBidsBufferJob();
