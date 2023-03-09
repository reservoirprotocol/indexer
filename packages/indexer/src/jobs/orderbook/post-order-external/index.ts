/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Sdk from "@reservoir0x/sdk";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import * as crypto from "crypto";

import { logger } from "@/common/logger";
import { rateLimitRedis, redis } from "@/common/redis";
import { config } from "@/config/index";

import * as OpenSeaApi from "@/jobs/orderbook/post-order-external/api/opensea";
import * as LooksrareApi from "@/jobs/orderbook/post-order-external/api/looksrare";
import * as X2Y2Api from "@/jobs/orderbook/post-order-external/api/x2y2";
import * as UniverseApi from "@/jobs/orderbook/post-order-external/api/universe";
import * as InfinityApi from "@/jobs/orderbook/post-order-external/api/infinity";
import * as FlowApi from "@/jobs/orderbook/post-order-external/api/flow";

import {
  RequestWasThrottledError,
  InvalidRequestError,
} from "@/jobs/orderbook/post-order-external/api/errors";
import { redb } from "@/common/db";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import * as crossPostingOrdersModel from "@/models/cross-posting-orders";
import { CrossPostingOrderStatus } from "@/models/cross-posting-orders";

const QUEUE_NAME = "orderbook-post-order-external-queue";
const MAX_RETRIES = 5;

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 60000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { crossPostingOrderId, orderId, orderData, orderbook, collectionId } =
        job.data as PostOrderExternalParams;

      logger.info(QUEUE_NAME, `Start. jobData=${JSON.stringify(job.data)}`);

      if (![1, 4, 5].includes(config.chainId)) {
        throw new Error("Unsupported network");
      }

      if (!["opensea", "looks-rare", "x2y2", "universe", "infinity", "flow"].includes(orderbook)) {
        throw new Error("Unsupported orderbook");
      }

      // TODO: Remove after deployment
      if (job.data.orderbookApiKey === null) {
        delete job.data.orderbookApiKey;
      }

      const orderbookApiKey = job.data.orderbookApiKey ?? getOrderbookDefaultApiKey(orderbook);
      const retry = job.data.retry ?? 0;

      let isRateLimited = false;
      let rateLimitExpiration = 0;

      const rateLimiter = getRateLimiter(orderbook);
      const rateLimiterKey = `${orderbook}:${orderbookApiKey}`;

      try {
        await rateLimiter.consume(rateLimiterKey, 1);
      } catch (error) {
        if (error instanceof RateLimiterRes) {
          isRateLimited = true;
          rateLimitExpiration = error.msBeforeNext;
        }
      }

      if (isRateLimited) {
        // If limit reached, reschedule job based on the limit expiration.
        logger.info(
          QUEUE_NAME,
          `Post Order Rate Limited. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
            orderData
          )}, rateLimitExpiration: ${rateLimitExpiration}, retry: ${retry}`
        );

        await addToQueue(job.data, rateLimitExpiration, true);
      } else {
        try {
          await postOrder(orderbook, orderId, orderData, orderbookApiKey, collectionId);

          if (crossPostingOrderId) {
            await crossPostingOrdersModel.updateOrderStatus(
              crossPostingOrderId,
              CrossPostingOrderStatus.posted
            );
          }

          if (crossPostingOrderId) {
            await crossPostingOrdersModel.updateOrderStatus(
              crossPostingOrderId,
              CrossPostingOrderStatus.posted
            );
          }

          logger.info(
            QUEUE_NAME,
            `Post Order Success. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
              orderData
            )}, retry: ${retry}`
          );
        } catch (error) {
          if (error instanceof RequestWasThrottledError) {
            // If we got throttled by the api, reschedule job based on the provided delay.
            const delay = error.delay;

            try {
              await rateLimiter.block(rateLimiterKey, Math.floor(delay / 1000));
            } catch (error) {
              logger.error(
                QUEUE_NAME,
                `Unable to set expiration. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
                  orderData
                )}, retry: ${retry}, delay=${delay}, error: ${error}`
              );
            }

            await addToQueue(job.data, delay, true);

            logger.info(
              QUEUE_NAME,
              `Post Order Throttled. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
                orderData
              )}, delay: ${delay}, retry: ${retry}`
            );
          } else if (error instanceof InvalidRequestError) {
            // If the order is invalid, fail the job.
            logger.error(
              QUEUE_NAME,
              `Post Order Failed - Invalid Order. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
                orderData
              )}, retry: ${retry}, error: ${error}`
            );

            if (crossPostingOrderId) {
              await crossPostingOrdersModel.updateOrderStatus(
                crossPostingOrderId,
                CrossPostingOrderStatus.failed,
                error.message
              );
            }
          } else if (retry < MAX_RETRIES) {
            // If we got an unknown error from the api, reschedule job based on fixed delay.
            logger.info(
              QUEUE_NAME,
              `Post Order Failed - Retrying. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
                orderData
              )}, retry: ${retry}`
            );

            job.data.retry = retry + 1;

            await addToQueue(job.data, 1000, true);
          } else {
            logger.error(
              QUEUE_NAME,
              `Post Order Failed - Max Retries Reached. orderbook${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
                orderData
              )}, retry: ${retry}, error: ${error}`
            );

            if (crossPostingOrderId) {
              await crossPostingOrdersModel.updateOrderStatus(
                crossPostingOrderId,
                CrossPostingOrderStatus.failed,
                (error as any).message
              );
            }
          }
        }
      }
    },
    {
      connection: redis.duplicate(),
      concurrency: 10,
    }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

const getOrderbookDefaultApiKey = (orderbook: string) => {
  switch (orderbook) {
    case "opensea":
      return config.openSeaApiKey;
    case "looks-rare":
      return config.looksRareApiKey;
    case "x2y2":
      return config.x2y2ApiKey;
    case "universe":
      return "";
    case "infinity":
      return config.infinityApiKey;
    case "flow":
      return config.flowApiKey;
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

const getRateLimiter = (orderbook: string) => {
  switch (orderbook) {
    case "looks-rare":
      return new RateLimiterRedis({
        storeClient: rateLimitRedis,
        points: LooksrareApi.RATE_LIMIT_REQUEST_COUNT,
        duration: LooksrareApi.RATE_LIMIT_INTERVAL,
      });
    case "opensea":
      return new RateLimiterRedis({
        storeClient: rateLimitRedis,
        points: OpenSeaApi.RATE_LIMIT_REQUEST_COUNT,
        duration: OpenSeaApi.RATE_LIMIT_INTERVAL,
      });
    case "x2y2":
      return new RateLimiterRedis({
        storeClient: rateLimitRedis,
        points: X2Y2Api.RATE_LIMIT_REQUEST_COUNT,
        duration: X2Y2Api.RATE_LIMIT_INTERVAL,
      });
    case "universe":
      return new RateLimiterRedis({
        storeClient: rateLimitRedis,
        points: UniverseApi.RATE_LIMIT_REQUEST_COUNT,
        duration: UniverseApi.RATE_LIMIT_INTERVAL,
      });
    case "infinity":
      return new RateLimiterRedis({
        storeClient: rateLimitRedis,
        points: InfinityApi.RATE_LIMIT_REQUEST_COUNT,
        duration: InfinityApi.RATE_LIMIT_INTERVAL,
      });
    case "flow":
      return new RateLimiterRedis({
        storeClient: rateLimitRedis,
        points: FlowApi.RATE_LIMIT_REQUEST_COUNT,
        duration: FlowApi.RATE_LIMIT_INTERVAL,
      });
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

const postOrder = async (
  orderbook: string,
  orderId: string | null,
  orderData: PostOrderExternalParams["orderData"],
  orderbookApiKey: string,
  collectionId?: string
) => {
  switch (orderbook) {
    case "opensea": {
      const order = new Sdk.SeaportV14.Order(
        config.chainId,
        orderData as Sdk.SeaportV14.Types.OrderComponents
      );

      logger.info(
        QUEUE_NAME,
        `Post Order Seaport. orderbook=${orderbook}, orderId=${orderId}, collectionId=${collectionId}, orderData=${JSON.stringify(
          orderData
        )}, side=${order.getInfo()?.side}, kind=${order.params.kind}`
      );

      if (
        order.getInfo()?.side === "buy" &&
        ["contract-wide", "token-list"].includes(order.params.kind!)
      ) {
        const { collectionSlug } = await redb.oneOrNone(
          `
                SELECT c.slug AS "collectionSlug"
                WHERE o.id = $/collectionId/
                LIMIT 1
            `,
          {
            collectionId,
          }
        );

        if (!collectionSlug) {
          throw new Error("Invalid collection offer.");
        }

        return OpenSeaApi.postCollectionOffer(order, collectionSlug, orderbookApiKey);
      }

      return OpenSeaApi.postOrder(order, orderbookApiKey);
    }

    case "looks-rare": {
      const order = new Sdk.LooksRare.Order(
        config.chainId,
        orderData as Sdk.LooksRare.Types.MakerOrderParams
      );
      return LooksrareApi.postOrder(order, orderbookApiKey);
    }

    case "universe": {
      const order = new Sdk.Universe.Order(config.chainId, orderData as Sdk.Universe.Types.Order);
      return UniverseApi.postOrder(order);
    }

    case "x2y2": {
      return X2Y2Api.postOrder(orderData as Sdk.X2Y2.Types.LocalOrder, orderbookApiKey);
    }

    case "infinity": {
      const order = new Sdk.Infinity.Order(
        config.chainId,
        orderData as Sdk.Infinity.Types.OrderInput
      );
      return InfinityApi.postOrders(order, orderbookApiKey);
    }

    case "flow": {
      const order = new Sdk.Flow.Order(config.chainId, orderData as Sdk.Flow.Types.OrderInput);
      return FlowApi.postOrders(order, orderbookApiKey);
    }
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

export type PostOrderExternalParams =
  | {
      crossPostingOrderId?: number;
      orderId: string;
      orderData: Sdk.Seaport.Types.OrderComponents;
      orderbook: "opensea";
      orderbookApiKey?: string | null;
      retry?: number;
      collectionId?: string;
    }
  | {
      crossPostingOrderId: number;
      orderId: string;
      orderData: Sdk.LooksRare.Types.MakerOrderParams;
      orderbook: "looks-rare";
      orderbookApiKey?: string | null;
      retry?: number;
      collectionId?: string;
    }
  | {
      crossPostingOrderId: number;
      orderId: string | null;
      orderData: Sdk.X2Y2.Types.LocalOrder;
      orderbook: "x2y2";
      orderbookApiKey?: string | null;
      retry?: number;
      collectionId?: string;
    }
  | {
      crossPostingOrderId: number;
      orderId: string;
      orderData: Sdk.Universe.Types.Order;
      orderbook: "universe";
      orderbookApiKey?: string | null;
      retry?: number;
      collectionId?: string;
    }
  | {
      crossPostingOrderId: number;
      orderId: string;
      orderData: Sdk.Infinity.Types.OrderInput;
      orderbook: "infinity";
      orderbookApiKey?: string | null;
      retry?: number;
      collectionId?: string;
    }
  | {
      crossPostingOrderId: number;
      orderId: string;
      orderData: Sdk.Flow.Types.OrderInput;
      orderbook: "flow";
      orderbookApiKey?: string | null;
      retry?: number;
      collectionId?: string;
    };

export const addToQueue = async (
  postOrderExternalParams: PostOrderExternalParams,
  delay = 0,
  prioritized = false
) => {
  await queue.add(crypto.randomUUID(), postOrderExternalParams, {
    delay,
    priority: prioritized ? 1 : undefined,
  });
};
