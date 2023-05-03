/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
import * as orderRevalidations from "@/jobs/order-fixes/revalidations";

// Callback for errors coming from the router logic
export const fillErrorCallback = async (
  kind: string,
  error: any,
  data: {
    orderId: string;
    additionalInfo: any;
    isUnrecoverable?: boolean;
  }
) => {
  const isUnrecoverable = data.isUnrecoverable || error.response?.status === 404;
  if (isUnrecoverable) {
    // Invalidate the order
    await orderRevalidations.addToQueue([{ id: data.orderId, status: "inactive" }]);
  }

  logger.warn(
    "router-on-recoverable-error",
    JSON.stringify({
      kind,
      unrecoverable: isUnrecoverable,
      error: error.response?.data?.error,
      data,
    })
  );
};

enum StatusCode {
  NOT_FOUND = 404,
  GONE = 410,
  FAILED_DEPENDENCY = 424,
  UNEXPECTED_ERROR = 500,
  UNAVAILABLE = 503,
  TIMEOUT = 504,
}

type PrettyErrorDetails = { message: string; status: number };

// Mapper of errors coming from the router logic
export const prettifyError = (msg: string): PrettyErrorDetails => {
  switch (true) {
    case msg.includes("Accepting offers is disabled for this NFT"):
      return {
        message:
          "This NFT cannot accept offers on OpenSea right now because it is flagged or recently transferred",
        status: StatusCode.NOT_FOUND,
      };

    case msg.includes("Request was throttled"):
      return {
        message: "Unable to fetch the order due to rate limiting. Please try again soon.",
        status: StatusCode.UNAVAILABLE,
      };

    case msg.includes("No available orders"):
    case msg.includes("Requested order is inactive and can only be seen by the order creator"):
    case msg.includes("The order_hash you provided does not exist"):
      return {
        message: "The order is not available anymore",
        status: StatusCode.GONE,
      };

    default:
      return { message: msg, status: StatusCode.UNEXPECTED_ERROR };
  }
};
