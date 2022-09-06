import { joinSignature } from "@ethersproject/bytes";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import * as crypto from "crypto";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { OrderbookApiRateLimiter } from "@/jobs/orderbook/post-order-external/api-rate-limiter";
import {
  RequestWasThrottledError,
  InvalidRequestError,
} from "@/jobs/orderbook/post-order-external/api-errors";

const QUEUE_NAME = "orderbook-post-order-external-queue";
const MAX_RETRIES = 5;

// Open Sea default rate limit - 2 requests per second for post apis
const OPENSEA_RATE_LIMIT_REQUEST_COUNT = 2;
const OPENSEA_RATE_LIMIT_INTERVAL = 1000;

// Looks Rare default rate limit - 120 requests per minute
const LOOKSRARE_RATE_LIMIT_REQUEST_COUNT = 120;
const LOOKSRARE_RATE_LIMIT_INTERVAL = 1000 * 60;

// X2Y2 default rate limit - 120 requests per minute
const X2Y2_RATE_LIMIT_REQUEST_COUNT = 120;
const X2Y2_RATE_LIMIT_INTERVAL = 1000 * 60;

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
      const { orderData, orderbook, retry } = job.data as PostOrderExternalParams;
      let orderbookApiKey = job.data.orderbookApiKey;

      if (![1, 4].includes(config.chainId)) {
        throw new Error("Unsupported network");
      }

      if (!["opensea", "looks-rare", "x2y2"].includes(orderbook)) {
        throw new Error("Unsupported orderbook");
      }

      orderbookApiKey = orderbookApiKey || getOrderbookDefaultApiKey(orderbook);

      const rateLimiter = getRateLimiter(orderbook, orderbookApiKey);

      if (await rateLimiter.reachedLimit()) {
        // If limit reached, reschedule job based on the limit expiration.
        const delay = await rateLimiter.getExpiration();

        logger.info(
          QUEUE_NAME,
          `Post Order Rate Limited. orderbook: ${orderbook}, orderData=${JSON.stringify(
            orderData
          )}, delay: ${delay}, retry: ${retry}`
        );

        await addToQueue(orderData, orderbook, orderbookApiKey, retry, delay, true);
      } else {
        try {
          await postOrder(orderbook, orderData, orderbookApiKey);

          logger.info(
            QUEUE_NAME,
            `Post Order Success. orderbook: ${orderbook}, orderData=${JSON.stringify(
              orderData
            )}, retry: ${retry}`
          );
        } catch (error) {
          if (error instanceof RequestWasThrottledError) {
            // If we got throttled by the api, reschedule job based on the provided delay.
            const delay = error.delay;

            await rateLimiter.setExpiration(delay);
            await addToQueue(orderData, orderbook, orderbookApiKey, retry, delay, true);

            logger.info(
              QUEUE_NAME,
              `Post Order Throttled. orderbook: ${orderbook}, orderData=${JSON.stringify(
                orderData
              )}, delay: ${delay}, retry: ${retry}`
            );
          } else if (error instanceof InvalidRequestError) {
            // If the order is invalid, fail the job.
            logger.error(
              QUEUE_NAME,
              `Post Order Failed - Invalid Order. orderbook: ${orderbook}, orderData=${JSON.stringify(
                orderData
              )}, retry: ${retry}, error: ${error}`
            );

            throw new Error("Post Order Failed - Invalid Order");
          } else if (retry < MAX_RETRIES) {
            // If we got an unknown error from the api, reschedule job based on fixed delay.
            logger.info(
              QUEUE_NAME,
              `Post Order Failed - Retrying. orderbook: ${orderbook}, orderData=${JSON.stringify(
                orderData
              )}, retry: ${retry}`
            );

            await addToQueue(orderData, orderbook, orderbookApiKey, ++job.data.retry, 1000, true);
          } else {
            logger.error(
              QUEUE_NAME,
              `Post Order Failed - Max Retries Reached. orderbook: ${orderbook}, orderData=${JSON.stringify(
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
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

const getRateLimiter = (orderbook: string, orderbookApiKey: string) => {
  switch (orderbook) {
    case "looks-rare":
      return new OrderbookApiRateLimiter(
        orderbook,
        orderbookApiKey,
        LOOKSRARE_RATE_LIMIT_REQUEST_COUNT,
        LOOKSRARE_RATE_LIMIT_INTERVAL
      );
    case "opensea":
      return new OrderbookApiRateLimiter(
        orderbook,
        orderbookApiKey,
        OPENSEA_RATE_LIMIT_REQUEST_COUNT,
        OPENSEA_RATE_LIMIT_INTERVAL
      );
    case "x2y2":
      return new OrderbookApiRateLimiter(
        orderbook,
        orderbookApiKey,
        X2Y2_RATE_LIMIT_REQUEST_COUNT,
        X2Y2_RATE_LIMIT_INTERVAL
      );
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

const postOrder = async (
  orderbook: string,
  orderData: Record<string, unknown>,
  orderbookApiKey: string
) => {
  switch (orderbook) {
    case "opensea": {
      const order = new Sdk.Seaport.Order(
        config.chainId,
        orderData as Sdk.Seaport.Types.OrderComponents
      );
      return postOpenSea(order, orderbookApiKey);
    }

    case "looks-rare": {
      const order = new Sdk.LooksRare.Order(
        config.chainId,
        orderData as Sdk.LooksRare.Types.MakerOrderParams
      );
      return postLooksRare(order, orderbookApiKey);
    }

    case "x2y2": {
      return postX2Y2(orderData as Sdk.X2Y2.Types.LocalOrder, orderbookApiKey);
    }
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

const postOpenSea = async (order: Sdk.Seaport.Order, apiKey: string) => {
  await axios
    .post(
      `https://${config.chainId === 4 ? "testnets-api." : "api."}opensea.io/v2/orders/${
        config.chainId === 4 ? "rinkeby" : "ethereum"
      }/seaport/${order.getInfo()?.side === "sell" ? "listings" : "offers"}`,
      JSON.stringify({
        parameters: {
          ...order.params,
          totalOriginalConsiderationItems: order.params.consideration.length,
        },
        signature: order.params.signature!,
      }),
      {
        headers:
          config.chainId === 1
            ? {
                "Content-Type": "application/json",
                "X-Api-Key": apiKey || config.openSeaApiKey,
              }
            : {
                "Content-Type": "application/json",
                // The request will fail if passing the API key on Rinkeby
              },
      }
    )
    .catch((error) => {
      if (error.response) {
        logger.error(
          QUEUE_NAME,
          `Failed to post order to OpenSea. order=${JSON.stringify(order)}, status: ${
            error.response.status
          }, data:${JSON.stringify(error.response.data)}`
        );

        switch (error.response.status) {
          case 429: {
            let delay = OPENSEA_RATE_LIMIT_INTERVAL;

            if (
              error.response.data.detail?.startsWith("Request was throttled. Expected available in")
            ) {
              try {
                delay = error.response.data.detail.split(" ")[6] * 1000;
              } catch {
                // Skip on any errors
              }
            }

            throw new RequestWasThrottledError("Request was throttled by OpenSea", delay);
          }
          case 400:
            throw new InvalidRequestError("Request was rejected by OpenSea");
        }
      }

      throw new Error(`Failed to post order to OpenSea`);
    });
};

const postLooksRare = async (order: Sdk.LooksRare.Order, apiKey: string) => {
  const lrOrder = {
    ...order.params,
    signature: joinSignature({
      v: order.params.v!,
      r: order.params.r!,
      s: order.params.s!,
    }),
    tokenId: order.params.kind === "single-token" ? order.params.tokenId : null,
    // For now, no order kinds have any additional params
    params: [],
  };

  await axios
    .post(
      `https://${config.chainId === 4 ? "api-rinkeby." : "api."}looksrare.org/api/v1/orders`,
      JSON.stringify(lrOrder),
      {
        headers: {
          "Content-Type": "application/json",
          "X-Looks-Api-Key": apiKey || config.looksRareApiKey,
        },
      }
    )
    .catch((error) => {
      if (error.response) {
        logger.error(
          QUEUE_NAME,
          `Failed to post order to LooksRare. order=${JSON.stringify(order)}, status: ${
            error.response.status
          }, data:${JSON.stringify(error.response.data)}`
        );

        switch (error.response.status) {
          case 429: {
            throw new RequestWasThrottledError(
              "Request was throttled by LooksRare",
              LOOKSRARE_RATE_LIMIT_INTERVAL
            );
          }
          case 400:
          case 401:
            throw new InvalidRequestError("Request was rejected by LooksRare");
        }
      }

      throw new Error(`Failed to post order to LooksRare`);
    });
};

const postX2Y2 = async (order: Sdk.X2Y2.Types.LocalOrder, apiKey: string) => {
  const exchange = new Sdk.X2Y2.Exchange(config.chainId, apiKey);

  // When lowering the price of an existing listing, X2Y2 requires
  // passing the order id of the previous listing, so here we have
  // this check in place so that we can cover such scenarios.
  let orderId: number | undefined;
  const upstreamOrder = Sdk.X2Y2.Order.fromLocalOrder(config.chainId, order);
  if (upstreamOrder.params.type === "sell") {
    const activeOrder = await redb.oneOrNone(
      `
        SELECT
          (orders.raw_data ->> 'id')::INT AS id
        FROM orders
        WHERE orders.token_set_id = $/tokenSetId/
          AND orders.fillability_status = 'fillable'
          AND orders.approval_status = 'approved'
          AND orders.side = 'sell'
          AND orders.maker = $/maker/
          AND orders.kind = 'x2y2'
        LIMIT 1
      `,
      {
        tokenSetId:
          `token:${upstreamOrder.params.nft.token}:${upstreamOrder.params.nft.tokenId}`.toLowerCase(),
        maker: toBuffer(upstreamOrder.params.maker),
      }
    );

    if (activeOrder?.id) {
      orderId = activeOrder.id;
    }
  }

  await exchange.postOrder(order, orderId).catch((error) => {
    if (error.response) {
      logger.error(
        QUEUE_NAME,
        `Failed to post order to X2Y2. order=${JSON.stringify(order)}, status: ${
          error.response.status
        }, data:${JSON.stringify(error.response.data)}`
      );
    }

    throw new Error("Failed to post order to X2Y2");
  });
};

export type PostOrderExternalParams =
  | {
      orderData: Sdk.Seaport.Types.OrderComponents;
      orderbook: "opensea";
      orderbookApiKey: string;
      retry: number;
    }
  | {
      orderData: Sdk.LooksRare.Types.MakerOrderParams;
      orderbook: "looks-rare";
      orderbookApiKey: string;
      retry: number;
    }
  | {
      orderData: Sdk.X2Y2.Types.LocalOrder;
      orderbook: "x2y2";
      orderbookApiKey: string;
      retry: number;
    };

export const addToQueue = async (
  orderData: Record<string, unknown>,
  orderbook: string,
  orderbookApiKey: string | null,
  retry = 0,
  delay = 0,
  prioritized = false
) => {
  await queue.add(
    crypto.randomUUID(),
    {
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
