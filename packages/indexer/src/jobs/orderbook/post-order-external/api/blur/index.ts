/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from "axios";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import {
  InvalidRequestError,
  RequestWasThrottledError,
} from "@/jobs/orderbook/post-order-external/api/errors";

// Blur default rate limit - 60 requests per minute
export const RATE_LIMIT_REQUEST_COUNT = 60;
export const RATE_LIMIT_INTERVAL = 60;

export type BlurData = {
  id: string;
  maker: string;
  marketplaceData: string;
  authToken: string;
  signature: string;
  isCollectionBid?: boolean;
};

export async function postOrder(order: BlurData): Promise<void> {
  const url = `${config.orderFetcherBaseUrl}/api/blur-submit-order`;
  try {
    await axios.post(url, {
      maker: order.maker,
      marketplaceData: order.marketplaceData,
      authToken: order.authToken,
      signature: order.signature,
      isCollectionBid: order.isCollectionBid ? "true" : undefined,
    });
  } catch (err: any) {
    if (err?.response) {
      logger.error(
        "blur-orderbook-api",
        `Failed to post order to Blur. order=${JSON.stringify(order)}, status=${
          err?.response?.status
        }, data=${JSON.stringify(err?.response?.data)}`
      );

      handleErrorResponse(err.response);
    }
    throw new Error(`Failed to post order to Blur`);
  }
}

const handleErrorResponse = (response: any) => {
  switch (response.status) {
    case 429: {
      let delay = RATE_LIMIT_INTERVAL;

      if ("x-ratelimit-reset" in response.headers) {
        delay = parseInt(response.headers["x-ratelimit-reset"], 10) * 1000;
      }
      throw new RequestWasThrottledError("Request was throttled by Blur", delay);
    }
    case 400:
      throw new InvalidRequestError(
        response.data ? JSON.stringify(response.data) : "Request was rejected by Blur"
      );
  }
};
