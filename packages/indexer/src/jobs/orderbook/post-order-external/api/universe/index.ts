import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { config } from "@/config/index";

import axios from "axios";
import { InvalidRequestError } from "@/jobs/orderbook/post-order-external/api/errors";

// Universe default rate limit - 120 requests per minute
export const RATE_LIMIT_REQUEST_COUNT = 120;
export const RATE_LIMIT_INTERVAL = 60;

export const postOrder = async (order: Sdk.Universe.Order) => {
  const apiOrder = JSON.parse(JSON.stringify(order));
  delete apiOrder.params.kind;
  await axios
    .post(
      `https://${
        config.chainId === 4 ? "dev.marketplace-api." : "prod-marketplace"
      }.universe.xyz/v1/orders/order`,
      JSON.stringify(apiOrder.params),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    )
    .catch((error) => {
      if (error.response) {
        logger.error(
          "universe_orderbook_api",
          `Failed to post order to Universe. order=${JSON.stringify(order)}, status: ${
            error.response.status
          }, data:${JSON.stringify(error.response.data)}`
        );

        switch (error.response.status) {
          case 400:
          case 401:
            throw new InvalidRequestError("Request was rejected by Universe");
        }
      }

      throw new Error(`Failed to post order to Universe`);
    });
};
