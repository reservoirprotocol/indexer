/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";

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

// Mapper of errors coming from the router logic
export const getExecuteError = (
  mainErrorMsg: string,
  subErrors: { orderId: string; message: string }[]
) => {
  const prettyMainError = prettifyError(mainErrorMsg);
  const boomError = Boom.boomify(new Error(prettyMainError.message), {
    statusCode: prettyMainError.status,
  });
  if (subErrors.length) {
    boomError.output.payload.errors = subErrors;
  }

  return boomError;
};

enum StatusCode {
  BAD_REQUEST = 400,
  NOT_FOUND = 404,
  GONE = 410,
  FAILED_DEPENDENCY = 424,
}

type PrettyErrorDetails = { message: string; status: number };

const prettifyError = (msg: string): PrettyErrorDetails => {
  const lc = (x: string) => x.toLowerCase();

  const m = lc(msg);
  const matches = (value: string) => m.includes(lc(value));

  switch (true) {
    case matches("accepting offers is disabled for this nft"):
      return {
        message:
          "This NFT cannot accept offers on OpenSea right now because it is flagged or recently transferred",
        status: StatusCode.NOT_FOUND,
      };

    case matches("request was throttled"):
      return {
        message: "Unable to fetch the order due to rate limiting. Please try again soon.",
        status: StatusCode.FAILED_DEPENDENCY,
      };

    case matches("no available orders"):
    case matches("requested order is inactive and can only be seen by the order creator"):
    case matches("the order_hash you provided does not exist"):
    case matches("cannot read properties of undefined (reading 'node')"):
      return {
        message: "The order is not available anymore",
        status: StatusCode.GONE,
      };

    case matches("error when generating fulfillment data"):
    case matches("you are not eligible to fulfill this order"):
    case matches("cannot be fulfilled for identifier"):
    case matches("socket hang up"):
    case matches("cannot read properties of null (reading 'eventactivity')"):
    case matches("cannot read properties of null (reading 'item')"):
    case matches("cannot read properties of undefined (reading 'slice')"):
    case matches("request failed with status code 408"):
    case matches("<!doctype html>"):
    case matches("matched with those values"):
    case matches("invalid graphql request"):
    case matches("econnreset"):
    case matches("econnrefused"):
      return {
        message: "Unable to generate fulfillment for the order",
        status: StatusCode.FAILED_DEPENDENCY,
      };

    default:
      return { message: msg, status: StatusCode.BAD_REQUEST };
  }
};
