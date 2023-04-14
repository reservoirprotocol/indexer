/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Sdk from "@reservoir0x/sdk";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import * as crypto from "crypto";

import { logger } from "@/common/logger";
import { rateLimitRedis, redis } from "@/common/redis";
import { config } from "@/config/index";

import * as BlurApi from "@/jobs/orderbook/post-order-external/api/blur";
import * as OpenSeaApi from "@/jobs/orderbook/post-order-external/api/opensea";
import * as LooksrareApi from "@/jobs/orderbook/post-order-external/api/looksrare";
import * as X2Y2Api from "@/jobs/orderbook/post-order-external/api/x2y2";
import * as UniverseApi from "@/jobs/orderbook/post-order-external/api/universe";
import * as FlowApi from "@/jobs/orderbook/post-order-external/api/flow";

import {
  InvalidRequestError,
  InvalidRequestErrorKind,
  RequestWasThrottledError,
} from "@/jobs/orderbook/post-order-external/api/errors";
import { redb } from "@/common/db";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import * as crossPostingOrdersModel from "@/models/cross-posting-orders";
import { CrossPostingOrderStatus } from "@/models/cross-posting-orders";
import { TSTAttribute, TSTCollection, TSTCollectionNonFlagged } from "@/orderbook/token-sets/utils";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";
import { toBuffer } from "@/common/utils";

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
      const { crossPostingOrderId, orderId, orderData, orderSchema, orderbook } =
        job.data as PostOrderExternalParams;

      if (!["blur", "opensea", "looks-rare", "x2y2", "universe", "flow"].includes(orderbook)) {
        if (crossPostingOrderId) {
          await crossPostingOrdersModel.updateOrderStatus(
            crossPostingOrderId,
            CrossPostingOrderStatus.failed,
            "Unsupported orderbook"
          );
        }

        throw new Error("Unsupported orderbook");
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
        logger.debug(
          QUEUE_NAME,
          `Post Order Rate Limited. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
            orderData
          )}, rateLimitExpiration=${rateLimitExpiration}, retry=${retry}`
        );

        await addToQueue(job.data, rateLimitExpiration, true);
      } else {
        try {
          await postOrder(orderbook, orderId, orderData, orderbookApiKey, orderSchema);

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
        } catch (error) {
          if (error instanceof RequestWasThrottledError) {
            // If we got throttled by the api, reschedule job based on the provided delay.
            const delay = Math.max(error.delay, 5);

            try {
              await rateLimiter.block(rateLimiterKey, Math.floor(delay / 1000));
            } catch (error) {
              logger.error(
                QUEUE_NAME,
                `Unable to set expiration. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
                  orderData
                )}, retry=${retry}, delay=${delay}, error=${error}`
              );
            }

            await addToQueue(job.data, delay, true);

            logger.warn(
              QUEUE_NAME,
              `Post Order Throttled. orderbook=${orderbook}, orderbookApiKey=${orderbookApiKey}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
                orderData
              )}, delay=${delay}, retry=${retry}`
            );
          } else if (error instanceof InvalidRequestError) {
            // If the order is invalid, fail the job.
            logger.info(
              QUEUE_NAME,
              `Post Order Failed - Invalid Order. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
                orderData
              )}, retry=${retry}, error=${error}, errorKind=${error.kind}`
            );

            if (crossPostingOrderId) {
              await crossPostingOrdersModel.updateOrderStatus(
                crossPostingOrderId,
                CrossPostingOrderStatus.failed,
                error.message
              );
            }

            if (error.kind === InvalidRequestErrorKind.InvalidFees) {
              // If fees are invalid, refresh the collection metadata to refresh the fees
              const order = new Sdk.SeaportV14.Order(
                config.chainId,
                orderData as Sdk.SeaportBase.Types.OrderComponents
              );
              const orderInfo = order.getInfo();

              if (orderInfo?.contract && orderInfo.tokenId) {
                const rawResult = await redb.oneOrNone(
                  `
                SELECT
                  tokens.contract,
                  tokens.token_id,
                  collections.id AS "collection_id",
                  collections.community
                FROM tokens
                JOIN collections ON collections.id = tokens.collection_id
                WHERE tokens.contract = $/contract/ AND tokens.token_id = $/tokenId/
                LIMIT 1
              `,
                  { contract: toBuffer(orderInfo.contract), tokenId: orderInfo.tokenId }
                );

                if (rawResult) {
                  logger.info(
                    QUEUE_NAME,
                    `Post Order Failed - Invalid Fees. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
                      orderData
                    )}, retry: ${retry}`
                  );

                  await collectionUpdatesMetadata.addToQueue(
                    rawResult.contract,
                    rawResult.token_id,
                    rawResult.community
                  );
                }
              }
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
            logger.info(
              QUEUE_NAME,
              `Post Order Failed - Max Retries Reached. orderbook${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
                orderData
              )}, retry=${retry}, error=${error}`
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
      concurrency: 3,
    }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

const getOrderbookDefaultApiKey = (orderbook: string) => {
  switch (orderbook) {
    case "blur":
      return config.orderFetcherApiKey;
    case "opensea":
      return config.openSeaCrossPostingApiKey;
    case "looks-rare":
      return config.looksRareApiKey;
    case "x2y2":
      return config.x2y2ApiKey;
    case "universe":
      return "";
    case "flow":
      return config.flowApiKey;
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

const getRateLimiter = (orderbook: string) => {
  switch (orderbook) {
    case "blur":
      return new RateLimiterRedis({
        storeClient: rateLimitRedis,
        points: BlurApi.RATE_LIMIT_REQUEST_COUNT,
        duration: BlurApi.RATE_LIMIT_INTERVAL,
      });
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
  orderSchema?: TSTCollection | TSTCollectionNonFlagged | TSTAttribute
) => {
  switch (orderbook) {
    case "opensea": {
      const order = new Sdk.SeaportV14.Order(
        config.chainId,
        orderData as Sdk.SeaportBase.Types.OrderComponents
      );

      if (
        order.getInfo()?.side === "buy" &&
        orderSchema &&
        ["collection", "collection-non-flagged", "attribute"].includes(orderSchema.kind)
      ) {
        const { collectionSlug } = await redb.oneOrNone(
          `
                SELECT c.slug AS "collectionSlug"
                FROM collections c
                WHERE c.id = $/collectionId/
                LIMIT 1
            `,
          {
            collectionId: orderSchema!.data.collection,
          }
        );

        if (!collectionSlug) {
          throw new Error("Invalid collection offer.");
        }

        if (orderSchema.kind === "attribute") {
          return OpenSeaApi.postTraitOffer(
            order,
            collectionSlug,
            orderSchema.data.attributes[0],
            orderbookApiKey
          );
        } else {
          return OpenSeaApi.postCollectionOffer(order, collectionSlug, orderbookApiKey);
        }
      }

      return OpenSeaApi.postOrder(order, orderbookApiKey);
    }

    case "looks-rare": {
      const order = new Sdk.LooksRareV2.Order(
        config.chainId,
        orderData as Sdk.LooksRareV2.Types.MakerOrderParams
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

    case "flow": {
      const order = new Sdk.Flow.Order(config.chainId, orderData as Sdk.Flow.Types.OrderInput);
      return FlowApi.postOrders(order, orderbookApiKey);
    }

    case "blur": {
      return BlurApi.postOrder(orderData as BlurApi.BlurData);
    }
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

export type PostOrderExternalParams =
  | {
      crossPostingOrderId?: number;
      orderId: string;
      orderData: Sdk.SeaportBase.Types.OrderComponents;
      orderSchema?: TSTCollection | TSTCollectionNonFlagged | TSTAttribute;
      orderbook: "opensea";
      orderbookApiKey?: string | null;
      retry?: number;
    }
  | {
      crossPostingOrderId: number;
      orderId: string;
      orderData: Sdk.LooksRareV2.Types.MakerOrderParams;
      orderSchema?: TSTCollection | TSTCollectionNonFlagged | TSTAttribute;
      orderbook: "looks-rare";
      orderbookApiKey?: string | null;
      retry?: number;
    }
  | {
      crossPostingOrderId: number;
      orderId: string | null;
      orderData: Sdk.X2Y2.Types.LocalOrder;
      orderSchema?: TSTCollection | TSTCollectionNonFlagged | TSTAttribute;
      orderbook: "x2y2";
      orderbookApiKey?: string | null;
      retry?: number;
    }
  | {
      crossPostingOrderId: number;
      orderId: string;
      orderData: Sdk.Universe.Types.Order;
      orderSchema?: TSTCollection | TSTCollectionNonFlagged | TSTAttribute;
      orderbook: "universe";
      orderbookApiKey?: string | null;
      retry?: number;
    }
  | {
      crossPostingOrderId: number;
      orderId: string;
      orderData: Sdk.Flow.Types.OrderInput;
      orderSchema?: TSTCollection | TSTCollectionNonFlagged | TSTAttribute;
      orderbook: "flow";
      orderbookApiKey?: string | null;
      retry?: number;
    }
  | {
      crossPostingOrderId: number;
      orderId: string;
      orderData: BlurApi.BlurData;
      orderSchema?: TSTCollection | TSTCollectionNonFlagged | TSTAttribute;
      orderbook: "blur";
      orderbookApiKey?: string | null;
      retry?: number;
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
