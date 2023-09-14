import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { logger } from "@/common/logger";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import {
  RequestWasThrottledError,
  InvalidRequestError,
} from "@/jobs/orderbook/post-order-external/api/errors";

import { orderbookOrdersJob } from "@/jobs/orderbook/orderbook-orders-job";

// Looks Rare default rate limit - 120 requests per minute
export const RATE_LIMIT_REQUEST_COUNT = 120;
export const RATE_LIMIT_INTERVAL = 60;

export const postOrder = async (order: Sdk.LooksRareV2.Order, apiKey: string) => {
  const lrOrder = {
    ...order.params,
  };

  // Skip posting orders that already expired
  if (lrOrder.endTime <= now()) {
    throw new InvalidRequestError("Order is expired");
  }
  // Skip posting orders with the listing time far in the past
  if (lrOrder.startTime <= now() - 5 * 60) {
    throw new InvalidRequestError("Order has listing time more than 5 minutes in the past");
  }

  await axios
    .post(
      `https://${config.chainId === 5 ? "api-goerli." : "api."}looksrare.org/api/v2/orders`,
      JSON.stringify(lrOrder),
      {
        headers:
          config.chainId === 1
            ? {
                "Content-Type": "application/json",
                "X-Looks-Api-Key": apiKey || config.looksRareApiKey,
              }
            : {
                "Content-Type": "application/json",
              },
      }
    )
    .catch((error) => {
      if (error.response) {
        logger.error(
          "looksrare-orderbook-api",
          `Failed to post order to LooksRare. order=${JSON.stringify(
            lrOrder
          )}, apiKey=${apiKey}, status=${error.response.status}, data=${JSON.stringify(
            error.response.data
          )}`
        );

        switch (error.response.status) {
          case 429: {
            throw new RequestWasThrottledError(
              "Request was throttled by LooksRare",
              RATE_LIMIT_INTERVAL
            );
          }
          case 400:
          case 401:
            throw new InvalidRequestError(
              `Request was rejected by LooksRare. error=${JSON.stringify(
                error.response.data.errors ?? error.response.data.message
              )}`
            );
        }
      }

      throw new Error(`Failed to post order to LooksRare`);
    });

  // If the cross-posting was successful, save the order directly
  await orderbookOrdersJob.addToQueue([
    {
      kind: "looks-rare-v2",
      info: {
        orderParams: order.params,
        metadata: {},
      },
    },
  ]);
};

export const postSeaportOrder = async (order: Sdk.SeaportV15.Order, apiKey: string) => {
  const lrOrder = {
    parameters: {
      ...order.params,
      totalOriginalConsiderationItems: order.params.consideration.length,
    },
    signature: order.params.signature!,
  };

  await axios
    .post(
      `https://${config.chainId === 5 ? "api-goerli." : "api."}looksrare.org/api/v2/orders/seaport`,
      JSON.stringify(lrOrder),
      {
        headers:
          config.chainId === 1
            ? {
                "Content-Type": "application/json",
                "X-Looks-Api-Key": apiKey || config.looksRareApiKey,
              }
            : {
                "Content-Type": "application/json",
              },
      }
    )
    .catch((error) => {
      if (error.response) {
        logger.error(
          "looksrare-orderbook-api",
          `Failed to post order to LooksRare. order=${JSON.stringify(
            lrOrder
          )}, apiKey=${apiKey}, status=${error.response.status}, data=${JSON.stringify(
            error.response.data
          )}`
        );

        switch (error.response.status) {
          case 429: {
            throw new RequestWasThrottledError(
              "Request was throttled by LooksRare",
              RATE_LIMIT_INTERVAL
            );
          }
          case 400:
          case 401:
            throw new InvalidRequestError(
              `Request was rejected by LooksRare. error=${JSON.stringify(
                error.response.data.errors ?? error.response.data.message
              )}`
            );
        }
      }

      throw new Error(`Failed to post order to LooksRare`);
    });

  // If the cross-posting was successful, save the order directly
  await orderbookOrdersJob.addToQueue([
    {
      kind: "seaport-v1.5",
      info: {
        orderParams: order.params,
        metadata: {},
      },
    },
  ]);
};
