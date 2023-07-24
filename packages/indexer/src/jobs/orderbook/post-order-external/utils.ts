/* eslint-disable @typescript-eslint/no-explicit-any */

import * as crossPostingOrdersModel from "@/models/cross-posting-orders";
import { CrossPostingOrderStatus } from "@/models/cross-posting-orders";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { fromBuffer, now, toBuffer } from "@/common/utils";
import { logger } from "@/common/logger";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import {
  InvalidRequestError,
  InvalidRequestErrorKind,
  RequestWasThrottledError,
} from "@/jobs/orderbook/post-order-external/api/errors";
import { redb } from "@/common/db";
import { collectionMetadataQueueJob } from "@/jobs/collection-updates/collection-metadata-queue-job";
import { rateLimitRedis } from "@/common/redis";
import * as BlurApi from "@/jobs/orderbook/post-order-external/api/blur";
import * as LooksrareApi from "@/jobs/orderbook/post-order-external/api/looksrare";
import * as OpenSeaApi from "@/jobs/orderbook/post-order-external/api/opensea";
import * as X2Y2Api from "@/jobs/orderbook/post-order-external/api/x2y2";
import { TSTAttribute, TSTCollection, TSTCollectionNonFlagged } from "@/orderbook/token-sets/utils";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { orderbookPostOrderExternalJob } from "@/jobs/orderbook/post-order-external/orderbook-post-order-external-job";
import { orderbookPostOrderExternalOpenseaJob } from "@/jobs/orderbook/post-order-external/orderbook-post-order-external-opensea-job";

const MAX_RETRIES = 5;

export const processOrder = async (
  job: AbstractRabbitMqJobHandler,
  payload: PostOrderExternalParams
) => {
  const { crossPostingOrderId, orderId, orderData, orderSchema, orderbook } = payload;

  if (!["blur", "opensea", "looks-rare", "x2y2"].includes(orderbook)) {
    if (crossPostingOrderId) {
      await crossPostingOrdersModel.updateOrderStatus(
        crossPostingOrderId,
        CrossPostingOrderStatus.failed,
        "Unsupported orderbook"
      );
    }

    throw new Error("Unsupported orderbook");
  }

  const orderbookApiKey = payload.orderbookApiKey ?? getOrderbookDefaultApiKey(orderbook);
  const retry = payload.retry ?? 0;

  let isRateLimited = false;
  let rateLimitExpiration = 0;

  const rateLimiter = getRateLimiter(orderbook);
  const rateLimiterKey = `${orderbook}:${orderbookApiKey}`;

  // TODO: move this to a validateOrder method
  if (orderbook === "opensea") {
    const order = new Sdk.SeaportV15.Order(
      config.chainId,
      orderData as Sdk.SeaportBase.Types.OrderComponents
    );

    if (order.params.endTime <= now()) {
      logger.info(
        job.queueName,
        `Post Order Failed - Order is expired. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
          orderData
        )}, retry=${retry}`
      );

      if (crossPostingOrderId) {
        await crossPostingOrdersModel.updateOrderStatus(
          crossPostingOrderId,
          CrossPostingOrderStatus.failed,
          "Order is expired."
        );
      }

      return;
    }
  }

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
      job.queueName,
      `Post Order Rate Limited. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
        orderData
      )}, rateLimitExpiration=${rateLimitExpiration}, retry=${retry}`
    );

    if (orderbook === "opensea") {
      await orderbookPostOrderExternalOpenseaJob.addToQueue(payload, rateLimitExpiration, true);
    } else {
      await orderbookPostOrderExternalJob.addToQueue(payload, rateLimitExpiration, true);
    }
  } else {
    try {
      await postOrder(orderbook, orderId, orderData, orderbookApiKey, orderSchema);

      logger.info(
        job.queueName,
        `Post Order Success. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
          orderData
        )}, rateLimitExpiration=${rateLimitExpiration}, retry=${retry}`
      );

      if (crossPostingOrderId) {
        const crossPostingOrder = await crossPostingOrdersModel.updateOrderStatus(
          crossPostingOrderId,
          CrossPostingOrderStatus.posted
        );

        await logMetric(crossPostingOrder);
      }
    } catch (error) {
      if (error instanceof RequestWasThrottledError) {
        // If we got throttled by the api, reschedule job based on the provided delay.
        const delay = Math.max(error.delay, 1000);

        try {
          await rateLimiter.block(rateLimiterKey, Math.floor(delay / 1000));
        } catch (error) {
          logger.error(
            job.queueName,
            `Unable to set expiration. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
              orderData
            )}, retry=${retry}, delay=${delay}, error=${error}`
          );
        }

        if (orderbook === "opensea") {
          await orderbookPostOrderExternalOpenseaJob.addToQueue(payload, delay, true);
        } else {
          await orderbookPostOrderExternalJob.addToQueue(payload, delay, true);
        }

        logger.warn(
          job.queueName,
          `Post Order Throttled. orderbook=${orderbook}, orderbookApiKey=${orderbookApiKey}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
            orderData
          )}, delay=${delay}, retry=${retry}`
        );
      } else if (error instanceof InvalidRequestError) {
        // If the order is invalid, fail the job.
        logger.info(
          job.queueName,
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

          let rawResult;

          if (order.params.kind !== "single-token") {
            rawResult = await redb.oneOrNone(
              `
                SELECT
                  tokens.contract,
                  tokens.token_id,
                  collections.royalties,
                  collections.new_royalties,
                  collections.community
                FROM collections
                JOIN tokens ON tokens.collection_id = collections.id
                WHERE collections = $/collectionId/
                LIMIT 1
            `,
              {
                collectionId: orderSchema!.data.collection,
              }
            );
          } else if (orderInfo?.tokenId) {
            rawResult = await redb.oneOrNone(
              `
                SELECT
                  tokens.contract,
                  tokens.token_id,
                  collections.royalties,
                  collections.new_royalties,
                  collections.community
                FROM tokens
                JOIN collections ON collections.id = tokens.collection_id
                WHERE tokens.contract = $/contract/ AND tokens.token_id = $/tokenId/
                LIMIT 1
              `,
              { contract: toBuffer(orderInfo.contract), tokenId: orderInfo.tokenId }
            );
          }

          if (rawResult) {
            logger.info(
              job.queueName,
              `Post Order Failed - Invalid Fees - Refreshing. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderbookApiKey=${orderbookApiKey}, orderKind=${
                order.params.kind
              }, orderId=${orderId}, orderData=${JSON.stringify(
                orderData
              )}, rawResult=${JSON.stringify(rawResult)}, retry: ${retry}`
            );

            await collectionMetadataQueueJob.addToQueue({
              contract: fromBuffer(rawResult.contract),
              tokenId: rawResult.token_id,
              community: rawResult.community,
            });
          }
        }
      } else if (retry < MAX_RETRIES) {
        // If we got an unknown error from the api, reschedule job based on fixed delay.
        logger.info(
          job.queueName,
          `Post Order Failed - Retrying. orderbook=${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
            orderData
          )}, retry: ${retry}`
        );

        payload.retry = retry + 1;

        if (orderbook === "opensea") {
          await orderbookPostOrderExternalOpenseaJob.addToQueue(payload, 1000, true);
        } else {
          await orderbookPostOrderExternalJob.addToQueue(payload, 1000, true);
        }
      } else {
        logger.info(
          job.queueName,
          `Post Order Failed - Max Retries Reached. orderbook${orderbook}, crossPostingOrderId=${crossPostingOrderId}, orderId=${orderId}, orderData=${JSON.stringify(
            orderData
          )}, retry=${retry}, error=${error}`
        );

        if (crossPostingOrderId) {
          const crossPostingOrder = await crossPostingOrdersModel.updateOrderStatus(
            crossPostingOrderId,
            CrossPostingOrderStatus.failed,
            (error as any).message
          );

          await logMetric(crossPostingOrder);
        }
      }
    }
  }
};

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
        keyPrefix: `${config.chainId}`,
      });
    case "looks-rare":
      return new RateLimiterRedis({
        storeClient: rateLimitRedis,
        points: LooksrareApi.RATE_LIMIT_REQUEST_COUNT,
        duration: LooksrareApi.RATE_LIMIT_INTERVAL,
        keyPrefix: `${config.chainId}`,
      });
    case "opensea":
      return new RateLimiterRedis({
        storeClient: rateLimitRedis,
        points: OpenSeaApi.RATE_LIMIT_REQUEST_COUNT,
        duration: OpenSeaApi.RATE_LIMIT_INTERVAL,
        keyPrefix: `${config.chainId}`,
      });
    case "x2y2":
      return new RateLimiterRedis({
        storeClient: rateLimitRedis,
        points: X2Y2Api.RATE_LIMIT_REQUEST_COUNT,
        duration: X2Y2Api.RATE_LIMIT_INTERVAL,
        keyPrefix: `${config.chainId}`,
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
      const order = new Sdk.SeaportV15.Order(
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
      // Seaport order
      if ("consideration" in orderData) {
        const order = new Sdk.SeaportV15.Order(
          config.chainId,
          orderData as Sdk.SeaportBase.Types.OrderComponents
        );
        return LooksrareApi.postSeaportOrder(order, orderbookApiKey);
      } else {
        const order = new Sdk.LooksRareV2.Order(
          config.chainId,
          orderData as Sdk.LooksRareV2.Types.MakerOrderParams
        );
        return LooksrareApi.postOrder(order, orderbookApiKey);
      }
    }

    case "x2y2": {
      return X2Y2Api.postOrder(orderData as Sdk.X2Y2.Types.LocalOrder, orderbookApiKey);
    }

    case "blur": {
      return BlurApi.postOrder(orderData as BlurApi.BlurData);
    }
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

const logMetric = (crossPostingOrder: any) => {
  if (!crossPostingOrder) return;

  try {
    logger.info(
      "cross-posting-latency-metric",
      JSON.stringify({
        latency:
          Math.floor(new Date(crossPostingOrder.updated_at).getTime() / 1000) -
          Math.floor(new Date(crossPostingOrder.created_at).getTime() / 1000),
        orderbook: crossPostingOrder.orderbook,
        crossPostingOrderId: crossPostingOrder.id,
        crossPostingOrderStatus: crossPostingOrder.status,
      })
    );
  } catch {
    // Ignore errors
  }
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
      orderData: Sdk.LooksRareV2.Types.MakerOrderParams | Sdk.SeaportBase.Types.OrderComponents;
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
      orderData: BlurApi.BlurData;
      orderSchema?: TSTCollection | TSTCollectionNonFlagged | TSTAttribute;
      orderbook: "blur";
      orderbookApiKey?: string | null;
      retry?: number;
    };
