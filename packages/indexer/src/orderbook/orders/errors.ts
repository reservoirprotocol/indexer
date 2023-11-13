/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";

import { logger } from "@/common/logger";
import { orderRevalidationsJob } from "@/jobs/order-fixes/order-revalidations-job";
import { blurBidsRefreshJob } from "@/jobs/order-updates/misc/blur-bids-refresh-job";

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
    await orderRevalidationsJob.addToQueue([
      {
        by: "id",
        data: { id: data.orderId, status: "inactive" },
      },
    ]);
  }

  // Custom logic based on the error kind
  if (kind === "order-fetcher-blur-offers") {
    if (data.additionalInfo.contract) {
      await blurBidsRefreshJob.addToQueue(data.additionalInfo.contract, true);
    }
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
  subErrors: { orderId: string; message: string }[] = []
) => {
  const prettyMainError = prettifyError(mainErrorMsg);
  const boomError = Boom.boomify(new Error(prettyMainError.message), {
    statusCode: prettyMainError.status,
  });
  if (subErrors.length) {
    boomError.output.payload.errors = subErrors;
  }
  boomError.output.payload.code = prettyMainError.code;

  return boomError;
};

enum StatusCode {
  BAD_REQUEST = 400,
  NOT_FOUND = 404,
  GONE = 410,
  FAILED_DEPENDENCY = 424,
}

type PrettyErrorDetails = {
  message: string;
  status: number;
  code: number;
};

const prettifyError = (msg: string): PrettyErrorDetails => {
  const lc = (x: string) => x.toLowerCase();

  const m = lc(msg);
  const matches = (value: string) => m.includes(lc(value));

  const badRequestWrapper = (code: number) => ({
    message: msg,
    status: StatusCode.BAD_REQUEST,
    code,
  });

  // The below logic includes both of the following:
  // - mappings from internal errors to external errors
  // - enhacements to external errors (eg. standard status code)
  switch (true) {
    case matches("accepting offers is disabled for this nft"):
      return {
        message:
          "This NFT cannot accept offers right now because it is flagged or recently transferred",
        status: StatusCode.NOT_FOUND,
        code: 1,
      };

    case matches("request was throttled"):
      return {
        message: "Unable to fetch the order due to rate limiting. Please try again soon.",
        status: StatusCode.FAILED_DEPENDENCY,
        code: 2,
      };

    case matches("no available orders"):
    case matches("requested order is inactive and can only be seen by the order creator"):
    case matches("the order_hash you provided does not exist"):
    case matches("cannot read properties of undefined (reading 'node')"):
    case matches("listingnotfound"):
      return {
        message: "The order is not available anymore",
        status: StatusCode.GONE,
        code: 3,
      };

    case matches("order is inactive"):
    case matches("order has been filled"):
    case matches("order has been cancelled"):
    case matches("order has expired"):
      return {
        message: msg,
        status: StatusCode.GONE,
        code: 3,
      };

    case matches("could not fetch calldata for all blur listings"):
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
        code: 4,
      };

    case matches("no fillable orders"):
      return badRequestWrapper(5);

    case matches("balance too low to proceed with transaction"):
      return badRequestWrapper(6);

    case matches("raw order failed to get processed"):
      return badRequestWrapper(7);

    case matches("unable to fill requested quantity"):
      return badRequestWrapper(8);

    case matches("token is flagged"):
      return badRequestWrapper(9);

    case matches("taker is not the owner of the token to sell"):
      return badRequestWrapper(10);

    case matches("unknown token"):
      return badRequestWrapper(11);

    case matches("no orders can be created"):
      return badRequestWrapper(12);

    case matches("royalties should be at least 0.5% when posting to opensea"):
      return badRequestWrapper(13);

    default:
      return {
        message: msg,
        status: StatusCode.BAD_REQUEST,
        code: -1,
      };
  }
};
