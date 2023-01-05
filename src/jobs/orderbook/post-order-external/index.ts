import * as Sdk from "@reservoir0x/sdk";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import * as crypto from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import * as OpenSeaApi from "@/jobs/orderbook/post-order-external/api/opensea";
import * as LooksrareApi from "@/jobs/orderbook/post-order-external/api/looksrare";
import * as X2Y2Api from "@/jobs/orderbook/post-order-external/api/x2y2";
import * as UniverseApi from "@/jobs/orderbook/post-order-external/api/universe";
import * as InfinityApi from "@/jobs/orderbook/post-order-external/api/infinity";

import { OrderbookApiRateLimiter } from "@/jobs/orderbook/post-order-external/api-rate-limiter";
import {
  RequestWasThrottledError,
  InvalidRequestError,
} from "@/jobs/orderbook/post-order-external/api/errors";
import { redb } from "@/common/db";

const QUEUE_NAME = "orderbook-post-order-external-queue";
const MAX_RETRIES = 5;

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 10000,
    timeout: 60000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { orderId, orderData, orderbook, retry } = job.data as PostOrderExternalParams;
      let orderbookApiKey = job.data.orderbookApiKey;

      if (![1, 4, 5].includes(config.chainId)) {
        throw new Error("Unsupported network");
      }

      if (!["opensea", "looks-rare", "x2y2", "universe", "infinity"].includes(orderbook)) {
        throw new Error("Unsupported orderbook");
      }

      orderbookApiKey = orderbookApiKey || getOrderbookDefaultApiKey(orderbook);

      const rateLimiter = getRateLimiter(orderbook, orderbookApiKey);

      if (await rateLimiter.reachedLimit()) {
        // If limit reached, reschedule job based on the limit expiration.
        const delay = await rateLimiter.getExpiration();

        logger.info(
          QUEUE_NAME,
          `Post Order Rate Limited. orderbook: ${orderbook}, orderId=${orderId}, orderData=${JSON.stringify(
            orderData
          )}, delay: ${delay}, retry: ${retry}`
        );

        await addToQueue(orderId, orderData, orderbook, orderbookApiKey, retry, delay, true);
      } else {
        try {
          await postOrder(orderbook, orderId, orderData, orderbookApiKey);

          logger.info(
            QUEUE_NAME,
            `Post Order Success. orderbook: ${orderbook}, orderId=${orderId}, orderData=${JSON.stringify(
              orderData
            )}, retry: ${retry}`
          );
        } catch (error) {
          if (error instanceof RequestWasThrottledError) {
            // If we got throttled by the api, reschedule job based on the provided delay.
            const delay = error.delay;

            await rateLimiter.setExpiration(delay);
            await addToQueue(orderId, orderData, orderbook, orderbookApiKey, retry, delay, true);

            logger.info(
              QUEUE_NAME,
              `Post Order Throttled. orderbook: ${orderbook}, orderId=${orderId}, orderData=${JSON.stringify(
                orderData
              )}, delay: ${delay}, retry: ${retry}`
            );
          } else if (error instanceof InvalidRequestError) {
            // If the order is invalid, fail the job.
            logger.error(
              QUEUE_NAME,
              `Post Order Failed - Invalid Order. orderbook: ${orderbook}, orderId=${orderId}, orderData=${JSON.stringify(
                orderData
              )}, retry: ${retry}, error: ${error}`
            );

            throw new Error("Post Order Failed - Invalid Order");
          } else if (retry < MAX_RETRIES) {
            // If we got an unknown error from the api, reschedule job based on fixed delay.
            logger.info(
              QUEUE_NAME,
              `Post Order Failed - Retrying. orderbook: ${orderbook}, orderId=${orderId}, orderData=${JSON.stringify(
                orderData
              )}, retry: ${retry}`
            );

            await addToQueue(
              orderId,
              orderData,
              orderbook,
              orderbookApiKey,
              ++job.data.retry,
              1000,
              true
            );
          } else {
            logger.error(
              QUEUE_NAME,
              `Post Order Failed - Max Retries Reached. orderbook: ${orderbook}, orderId=${orderId}, orderData=${JSON.stringify(
                orderData
              )}, retry: ${retry}, error: ${error}`
            );

            throw new Error("Post Order Failed - Max Retries Reached");
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
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

const getRateLimiter = (orderbook: string, orderbookApiKey: string) => {
  switch (orderbook) {
    case "looks-rare":
      return new OrderbookApiRateLimiter(
        orderbook,
        orderbookApiKey,
        LooksrareApi.RATE_LIMIT_REQUEST_COUNT,
        LooksrareApi.RATE_LIMIT_INTERVAL
      );
    case "opensea":
      return new OrderbookApiRateLimiter(
        orderbook,
        orderbookApiKey,
        OpenSeaApi.RATE_LIMIT_REQUEST_COUNT,
        OpenSeaApi.RATE_LIMIT_INTERVAL
      );
    case "x2y2":
      return new OrderbookApiRateLimiter(
        orderbook,
        orderbookApiKey,
        X2Y2Api.RATE_LIMIT_REQUEST_COUNT,
        X2Y2Api.RATE_LIMIT_INTERVAL
      );
    case "universe":
      return new OrderbookApiRateLimiter(
        orderbook,
        orderbookApiKey,
        UniverseApi.RATE_LIMIT_REQUEST_COUNT,
        UniverseApi.RATE_LIMIT_INTERVAL
      );
    case "infinity":
      return new OrderbookApiRateLimiter(
        orderbook,
        orderbookApiKey,
        InfinityApi.RATE_LIMIT_REQUEST_COUNT,
        InfinityApi.RATE_LIMIT_INTERVAL
      );
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

const postOrder = async (
  orderbook: string,
  orderId: string,
  orderData: PostOrderExternalParams["orderData"],
  orderbookApiKey: string
) => {
  switch (orderbook) {
    case "opensea": {
      const order = new Sdk.Seaport.Order(
        config.chainId,
        orderData as Sdk.Seaport.Types.OrderComponents
      );

      logger.info(
        QUEUE_NAME,
        `Post Order Seaport. orderbook: ${orderbook}, orderId=${orderId}, orderData=${JSON.stringify(
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
                FROM orders o
                JOIN token_sets ts
                  ON o.token_set_id = ts.id
                JOIN collections c   
                  ON c.id = ts.collection_id  
                WHERE o.id = $/orderId/
                AND ts.collection_id IS NOT NULL
                AND ts.attribute_id IS NULL
                LIMIT 1
            `,
          {
            orderId: orderId,
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
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

export type PostOrderExternalParams =
  | {
      orderId: string;
      orderData: Sdk.Seaport.Types.OrderComponents;
      orderbook: "opensea";
      orderbookApiKey: string;
      retry: number;
    }
  | {
      orderId: string;
      orderData: Sdk.LooksRare.Types.MakerOrderParams;
      orderbook: "looks-rare";
      orderbookApiKey: string;
      retry: number;
    }
  | {
      orderId: string;
      orderData: Sdk.X2Y2.Types.LocalOrder;
      orderbook: "x2y2";
      orderbookApiKey: string;
      retry: number;
    }
  | {
      orderId: string;
      orderData: Sdk.Universe.Types.Order;
      orderbook: "universe";
      retry: number;
    }
  | {
      orderId: string;
      orderData: Sdk.Infinity.Types.OrderInput;
      orderbook: "infinity";
      retry: number;
    };

export const addToQueue = async (
  orderId: string | null,
  orderData: PostOrderExternalParams["orderData"],
  orderbook: string,
  orderbookApiKey: string | null,
  retry = 0,
  delay = 0,
  prioritized = false
) => {
  await queue.add(
    crypto.randomUUID(),
    {
      orderId,
      orderData,
      orderbook,
      orderbookApiKey,
      retry,
    },
    {
      delay,
      priority: prioritized ? 1 : undefined,
    }
  );
};
