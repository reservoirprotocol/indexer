import { joinSignature } from "@ethersproject/bytes";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { logger } from "@/common/logger";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import {
  RequestWasThrottledError,
  InvalidRequestError,
} from "@/jobs/orderbook/post-order-external/api/errors";

// Looks Rare default rate limit - 120 requests per minute
export const RATE_LIMIT_REQUEST_COUNT = 120;
export const RATE_LIMIT_INTERVAL = 60;

export const postOrder = async (order: Sdk.LooksRare.Order, apiKey: string) => {
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
      `https://${config.chainId === 5 ? "api-goerli." : "api."}looksrare.org/api/v1/orders`,
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
                error.response.data.message
              )}`
            );
        }
      }

      throw new Error(`Failed to post order to LooksRare`);
    });
};
