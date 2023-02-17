import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { logger } from "@/common/logger";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import {
  RequestWasThrottledError,
  InvalidRequestError,
} from "@/jobs/orderbook/post-order-external/api/errors";
import { getOpenseaNetworkName, getOpenseaSubDomain } from "@/config/network";

// Open Sea default rate limit - 2 requests per second for post apis
export const RATE_LIMIT_REQUEST_COUNT = 2;
export const RATE_LIMIT_INTERVAL = 1;

export const postOrder = async (order: Sdk.Seaport.Order, apiKey: string) => {
  const url = `https://${getOpenseaSubDomain()}.opensea.io/v2/orders/${getOpenseaNetworkName()}/seaport/${
    order.getInfo()?.side === "sell" ? "listings" : "offers"
  }`;

  // Skip posting orders that already expired
  if (order.params.endTime <= now()) {
    return;
  }

  await axios
    .post(
      url,
      JSON.stringify({
        parameters: {
          ...order.params,
          totalOriginalConsiderationItems: order.params.consideration.length,
        },
        signature: order.params.signature!,
      }),
      {
        headers:
          config.chainId === 1
            ? {
                "Content-Type": "application/json",
                "X-Api-Key": apiKey || config.openSeaApiKey,
              }
            : {
                "Content-Type": "application/json",
                // The request will fail if passing the API key on Rinkeby
              },
      }
    )
    .catch((error) => {
      if (error.response) {
        logger.error(
          "opensea_orderbook_api",
          `Failed to post order to OpenSea. order=${JSON.stringify(order)}, status: ${
            error.response.status
          }, data:${JSON.stringify(error.response.data)}`
        );

        handleErrorResponse(error.response);
      }

      throw new Error(`Failed to post order to OpenSea`);
    });
};

export const buildCollectionOffer = async (
  offerer: string,
  quantity: number,
  collectionSlug: string,
  apiKey = ""
) => {
  const url = `https://${getOpenseaSubDomain()}.opensea.io/v2/offers/build`;

  return (
    axios
      .post(
        url,
        JSON.stringify({
          offerer,
          quantity,
          criteria: {
            collection: {
              slug: collectionSlug,
            },
          },
        }),
        {
          headers:
            config.chainId === 1
              ? {
                  "Content-Type": "application/json",
                  "X-Api-Key": apiKey || config.openSeaApiKey,
                }
              : {
                  "Content-Type": "application/json",
                  // The request will fail if passing the API key on Rinkeby
                },
        }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((response) => response.data as any)
      .catch((error) => {
        logger.error(
          "opensea_orderbook_api",
          `Build OpenSea collection offer error. offerer=${offerer}, quantity=${quantity}, collectionSlug=${collectionSlug}, error=${error}`
        );

        if (error.response) {
          logger.error(
            "opensea_orderbook_api",
            `Failed to build OpenSea collection offer. offerer=${offerer}, quantity=${quantity}, collectionSlug=${collectionSlug}, status: ${
              error.response.status
            }, data:${JSON.stringify(error.response.data)}`
          );

          handleErrorResponse(error.response);
        }

        throw new Error(`Failed to build OpenSea collection offer`);
      })
  );
};

export const postCollectionOffer = async (
  order: Sdk.Seaport.Order,
  collectionSlug: string,
  apiKey: string
) => {
  const url = `https://${getOpenseaSubDomain()}.opensea.io/v2/offers`;
  const data = JSON.stringify({
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
  });

  await axios
    .post(url, data, {
      headers:
        config.chainId === 1
          ? {
              "Content-Type": "application/json",
              "X-Api-Key": apiKey || config.openSeaApiKey,
            }
          : {
              "Content-Type": "application/json",
              // The request will fail if passing the API key on Rinkeby
            },
    })
    .catch((error) => {
      logger.error(
        "opensea_orderbook_api",
        `Post OpenSea collection offer error. order=${JSON.stringify(
          order
        )}, collectionSlug=${collectionSlug}, url=${url}, data=${data}, error=${error}`
      );

      if (error.response) {
        logger.error(
          "opensea_orderbook_api",
          `Failed to post offer to OpenSea. order=${JSON.stringify(
            order
          )}, collectionSlug=${collectionSlug}, url=${url}, data=${data}, status: ${
            error.response.status
          }, data:${JSON.stringify(error.response.data)}`
        );

        handleErrorResponse(error.response);
      }

      throw new Error(`Failed to post offer to OpenSea`);
    });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleErrorResponse = (response: any) => {
  switch (response.status) {
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
    case 400:
      throw new InvalidRequestError(
        `Request was rejected by OpenSea. errors=${JSON.stringify(response.data.errors)}`
      );
  }
};
