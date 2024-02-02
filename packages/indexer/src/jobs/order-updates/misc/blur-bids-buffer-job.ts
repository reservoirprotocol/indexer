import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { blurBidsRefreshJob } from "@/jobs/order-updates/misc/blur-bids-refresh-job";
import { orderbookOrdersJob } from "@/jobs/orderbook/orderbook-orders-job";

export type BlurBidsBufferJobPayload = {
  collection: string;
  attribute?: {
    key: string;
    value: string;
  };
};

export default class BlurBidsBufferJob extends AbstractRabbitMqJobHandler {
  queueName = "blur-bids-buffer";
  maxRetries = 20;
  concurrency = 30;
  backoff = {
    type: "fixed",
    delay: 30000,
  } as BackoffStrategy;

  public async process(payload: BlurBidsBufferJobPayload) {
    const { collection } = payload;

    if (config.chainId !== 1) {
      return;
    }

    try {
      const cacheKey = this.getCacheKey(payload);

      // This is not 100% atomic or consistent but it covers most scenarios
      const result = await redis.hvals(cacheKey);
      if (result.length) {
        await redis.del(cacheKey);

        const pricePoints = result.map((r) => JSON.parse(r));
        if (pricePoints.length) {
          await orderbookOrdersJob.addToQueue([
            {
              kind: "blur-bid",
              info: {
                orderParams: {
                  ...payload,
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

  public getCacheKey(payload: BlurBidsBufferJobPayload) {
    const attributeId = payload.attribute
      ? `:${payload.attribute.key}:${payload.attribute.value}`
      : "";
    return `blur-bid-incoming-price-points:${payload.collection}${attributeId}`;
  }

  public async addToQueue(
    payload: BlurBidsBufferJobPayload,
    pricePoints: Sdk.Blur.Types.BlurBidPricePoint[]
  ) {
    const cacheKey = this.getCacheKey(payload);
    await redis.hset(cacheKey, ...pricePoints.map((pp) => [pp.price, JSON.stringify(pp)]).flat());
    await this.send({ payload, jobId: cacheKey }, 30 * 1000);
  }
}

export const blurBidsBufferJob = new BlurBidsBufferJob();
