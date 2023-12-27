/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Sdk from "@reservoir0x/sdk";
import axios, { AxiosRequestConfig } from "axios";

import { logger } from "@/common/logger";
import { bn, now } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings, getOpenseaBaseUrl, getOpenseaNetworkName } from "@/config/network";
import {
  RequestWasThrottledError,
  InvalidRequestError,
  InvalidRequestErrorKind,
} from "@/jobs/orderbook/post-order-external/api/errors";

import { orderbookOrdersJob } from "@/jobs/orderbook/orderbook-orders-job";

// Open Sea default rate limit - 2 requests per second for post apis
export const RATE_LIMIT_REQUEST_COUNT = 2;
export const RATE_LIMIT_INTERVAL = 1;

export const postOrder = async (order: Sdk.SeaportV15.Order, apiKey: string) => {
  // Skip posting orders that already expired
  if (order.params.endTime <= now()) {
    throw new InvalidRequestError("Order is expired");
  }

  // Make sure to convert any hex values to decimal
  for (const item of order.params.consideration) {
    item.identifierOrCriteria = bn(item.identifierOrCriteria).toString();
  }
  for (const item of order.params.offer) {
    item.identifierOrCriteria = bn(item.identifierOrCriteria).toString();
  }

  const url = `${getOpenseaBaseUrl()}/v2/orders/${getOpenseaNetworkName()}/seaport/${
    order.getInfo()?.side === "sell" ? "listings" : "offers"
  }`;
  const headers: any = !getNetworkSettings().isTestnet
    ? {
        url,
        "Content-Type": "application/json",
        "X-Api-Key": apiKey || config.openSeaApiKey,
      }
    : {
        "Content-Type": "application/json",
      };

  if (!getNetworkSettings().isTestnet && config.openSeaApiUrl && config.openSeaNftApiKey) {
    headers["x-nft-api-key"] = config.openSeaNftApiKey;
  }

  const options: AxiosRequestConfig = {
    method: "POST",
    url: config.openSeaApiUrl || url,
    headers,
    data: {
      parameters: {
        ...order.params,
        totalOriginalConsiderationItems: order.params.consideration.length,
      },
      signature: order.params.signature!,
      protocol_address: Sdk.SeaportV15.Addresses.Exchange[config.chainId],
    },
  };

  await axios.request(options).catch((error) => {
    if (error.response) {
      handleErrorResponse(error.response);
    }

    logger.error(
      "opensea-orderbook-api",
      `Post OpenSea order error. options=${JSON.stringify(
        options
      )}, error=${error}, responseStatus=${error.response?.status}, responseData=${JSON.stringify(
        error.response?.data
      )}`
    );

    throw new Error(`Failed to post order to OpenSea`);
  });

  // If the cross-posting was successful, save the order directly
  await orderbookOrdersJob.addToQueue([
    {
      kind: "seaport-v1.5",
      info: {
        orderParams: order.params,
        metadata: {},
        isOpenSea: true,
      },
    },
  ]);
};

export const buildCollectionOffer = async (
  offerer: string,
  quantity: number,
  collectionSlug: string,
  apiKey = ""
) => {
  const url = `${getOpenseaBaseUrl()}/v2/offers/build`;
  const headers: any = !getNetworkSettings().isTestnet
    ? {
        url,
        "Content-Type": "application/json",
        "X-Api-Key": apiKey || config.openSeaApiKey,
      }
    : {
        "Content-Type": "application/json",
      };

  if (!getNetworkSettings().isTestnet && config.openSeaApiUrl && config.openSeaNftApiKey) {
    headers["x-nft-api-key"] = config.openSeaNftApiKey;
  }

  const options: AxiosRequestConfig = {
    method: "post",
    url: config.openSeaApiUrl || url,
    headers,
    data: {
      offerer,
      quantity,
      criteria: {
        collection: {
          slug: collectionSlug,
        },
      },
      protocol_address: Sdk.SeaportV15.Addresses.Exchange[config.chainId],
    },
  };

  return (
    axios
      .request(options)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((response) => response.data as any)
      .catch((error) => {
        if (error.response) {
          handleErrorResponse(error.response);
        }

        logger.error(
          "opensea-orderbook-api",
          `Build OpenSea collection offer error. options=${JSON.stringify(
            options
          )}, error=${JSON.stringify(error)}, responseStatus=${
            error.response?.status
          }, responseData=${JSON.stringify(error.response?.data)}`
        );

        throw new Error(`Failed to build OpenSea collection offer`);
      })
  );
};

export const buildTraitOffer = async (
  offerer: string,
  quantity: number,
  collectionSlug: string,
  traitType: string,
  traitValue: string,
  apiKey = ""
) => {
  const url = `${getOpenseaBaseUrl()}/v2/offers/build`;
  const headers: any = !getNetworkSettings().isTestnet
    ? {
        url,
        "Content-Type": "application/json",
        "X-Api-Key": apiKey || config.openSeaApiKey,
      }
    : {
        "Content-Type": "application/json",
      };

  if (!getNetworkSettings().isTestnet && config.openSeaApiUrl && config.openSeaNftApiKey) {
    headers["x-nft-api-key"] = config.openSeaNftApiKey;
  }

  const options: AxiosRequestConfig = {
    method: "post",
    url: config.openSeaApiUrl || url,
    headers,
    data: {
      offerer,
      quantity,
      criteria: {
        collection: {
          slug: collectionSlug,
        },
        trait: {
          type: traitType,
          value: traitValue,
        },
      },
      protocol_address: Sdk.SeaportV15.Addresses.Exchange[config.chainId],
    },
  };

  return (
    axios
      .request(options)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((response) => response.data as any)
      .catch((error) => {
        if (error.response) {
          handleErrorResponse(error.response);
        }

        logger.error(
          "opensea_orderbook_api",
          `Build OpenSea trait offer error. options=${JSON.stringify(
            options
          )}, error=${error}, responseStatus=${
            error.response?.status
          }, responseData=${JSON.stringify(error.response?.data)}`
        );

        throw new Error(`Failed to build OpenSea trait offer`);
      })
  );
};

export const postCollectionOffer = async (
  order: Sdk.SeaportV15.Order,
  collectionSlug: string,
  apiKey: string
) => {
  // Skip posting orders that already expired
  if (order.params.endTime <= now()) {
    throw new InvalidRequestError("Order is expired");
  }

  const url = `${getOpenseaBaseUrl()}/v2/offers`;
  const headers: any = !getNetworkSettings().isTestnet
    ? {
        url,
        "Content-Type": "application/json",
        "X-Api-Key": apiKey || config.openSeaApiKey,
      }
    : {
        "Content-Type": "application/json",
      };

  if (!getNetworkSettings().isTestnet && config.openSeaApiUrl && config.openSeaNftApiKey) {
    headers["x-nft-api-key"] = config.openSeaNftApiKey;
  }

  const options: AxiosRequestConfig = {
    method: "post",
    url: config.openSeaApiUrl || url,
    headers,
    data: {
      criteria: {
        collection: {
          slug: collectionSlug,
        },
      },
      protocol_data: {
        parameters: {
          ...order.params,
          totalOriginalConsiderationItems: order.params.consideration.length,
        },
        signature: order.params.signature!,
      },
      protocol_address: Sdk.SeaportV15.Addresses.Exchange[config.chainId],
    },
  };

  await axios.request(options).catch((error) => {
    if (error.response) {
      handleErrorResponse(error.response);
    }

    logger.error(
      "opensea-orderbook-api",
      `Post OpenSea collection offer error. options=${JSON.stringify(
        options
      )}, error=${error}, responseStatus=${error.response?.status}, responseData=${JSON.stringify(
        error.response?.data
      )}`
    );

    throw new Error(`Failed to post offer to OpenSea`);
  });
};

export const postTraitOffer = async (
  order: Sdk.SeaportV15.Order,
  collectionSlug: string,
  attribute: { key: string; value: string },
  apiKey: string
) => {
  // Skip posting orders that already expired
  if (order.params.endTime <= now()) {
    throw new InvalidRequestError("Order is expired");
  }

  const url = `${getOpenseaBaseUrl()}/v2/offers`;
  const headers: any = !getNetworkSettings().isTestnet
    ? {
        url,
        "Content-Type": "application/json",
        "X-Api-Key": apiKey || config.openSeaApiKey,
      }
    : {
        "Content-Type": "application/json",
      };

  if (!getNetworkSettings().isTestnet && config.openSeaApiUrl && config.openSeaNftApiKey) {
    headers["x-nft-api-key"] = config.openSeaNftApiKey;
  }

  const options: AxiosRequestConfig = {
    method: "post",
    url: config.openSeaApiUrl || url,
    headers,
    data: {
      criteria: {
        collection: {
          slug: collectionSlug,
        },
        trait: {
          type: attribute.key,
          value: attribute.value,
        },
      },
      protocol_data: {
        parameters: {
          ...order.params,
          totalOriginalConsiderationItems: order.params.consideration.length,
        },
        signature: order.params.signature!,
      },
      protocol_address: Sdk.SeaportV15.Addresses.Exchange[config.chainId],
    },
  };

  await axios.request(options).catch((error) => {
    if (error.response) {
      handleErrorResponse(error.response);
    }

    logger.error(
      "opensea-orderbook-api",
      `Post OpenSea trait offer error. order=${JSON.stringify(order)}, options=${JSON.stringify(
        options
      )}, error=${error}, responseStatus=${error.response?.status}, responseData=${JSON.stringify(
        error.response?.data
      )}`
    );

    throw new Error(`Failed to post offer to OpenSea`);
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleErrorResponse = (response: any) => {
  switch (response.status) {
    case 503:
    case 429: {
      let delay = RATE_LIMIT_INTERVAL;

      if (response.data.detail?.startsWith("Request was throttled. Expected available in")) {
        try {
          delay = response.data.detail.split(" ")[6] * 1000;
        } catch {
          // Skip on any errors
        }
      }

      throw new RequestWasThrottledError("Request was throttled by OpenSea", delay);
    }
    case 400: {
      const error = response.data.errors?.toString();
      const message = `Request was rejected by OpenSea. error=${JSON.stringify(response.data)}`;

      const invalidFeeErrors = [
        "You have provided a fee",
        "You have not provided all required creator fees",
        "You have provided fees that we cannot attribute to OpenSea or the collection",
      ];

      for (const invalidFeeError of invalidFeeErrors) {
        if (error.startsWith(invalidFeeError)) {
          throw new InvalidRequestError(message, InvalidRequestErrorKind.InvalidFees);
        }
      }

      throw new InvalidRequestError(message);
    }
  }
};
