import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { logger } from "@/common/logger";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import {
  RequestWasThrottledError,
  InvalidRequestError,
  InvalidRequestErrorKind,
} from "@/jobs/orderbook/post-order-external/api/errors";
import { getOpenseaBaseUrl, getOpenseaNetworkName, getOpenseaSubDomain } from "@/config/network";

// Open Sea default rate limit - 2 requests per second for post apis
export const RATE_LIMIT_REQUEST_COUNT = 2;
export const RATE_LIMIT_INTERVAL = 1;

export const postOrder = async (order: Sdk.SeaportV14.Order, apiKey: string) => {
  const url = `https://${getOpenseaSubDomain()}.opensea.io/v2/orders/${getOpenseaNetworkName()}/seaport/${
    order.getInfo()?.side === "sell" ? "listings" : "offers"
  }`;

  // Skip posting orders that already expired
  if (order.params.endTime <= now()) {
    throw new InvalidRequestError("Order is expired");
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
        protocol_address: Sdk.SeaportV14.Addresses.Exchange[config.chainId],
      }),
      {
        headers:
          config.chainId != 5
            ? {
                "Content-Type": "application/json",
                "X-Api-Key": apiKey || config.openSeaApiKey,
              }
            : {
                "Content-Type": "application/json",
                // The request will fail if passing the API key on Opensea Testnet APIs
              },
      }
    )
    .catch((error) => {
      logger.error(
        "opensea-orderbook-api",
        `Post OpenSea order error. order=${JSON.stringify(
          order
        )}, apiKey=${apiKey}, error=${error}, responseStatus=${
          error.response?.status
        }, responseData=${JSON.stringify(error.response?.data)}`
      );

      if (error.response) {
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
  const url = `${config.openSeaCrossPostingApiUrl || getOpenseaBaseUrl()}/v2/offers/build`;

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
            config.chainId != 5
              ? {
                  "Content-Type": "application/json",
                  [config.openSeaCrossPostingApiKeyHeader]:
                    apiKey || config.openSeaCrossPostingApiKey,
                }
              : {
                  "Content-Type": "application/json",
                  // The request will fail if passing the API key on Opensea Testnet APIs
                },
        }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((response) => response.data as any)
      .catch((error) => {
        logger.error(
          "opensea-orderbook-api",
          `Build OpenSea collection offer error. offerer=${offerer}, quantity=${quantity}, collectionSlug=${collectionSlug}, apiKey=${apiKey}, error=${error}, responseStatus=${
            error.response?.status
          }, responseData=${JSON.stringify(error.response?.data)}`
        );

        if (error.response) {
          handleErrorResponse(error.response);
        }

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
            trait: {
              type: traitType,
              value: traitValue,
            },
          },
        }),
        {
          headers:
            config.chainId != 5
              ? {
                  "Content-Type": "application/json",
                  "X-Api-Key": apiKey || config.openSeaApiKey,
                }
              : {
                  "Content-Type": "application/json",
                  // The request will fail if passing the API key on Opensea Testnet APIs
                },
        }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((response) => response.data as any)
      .catch((error) => {
        logger.error(
          "opensea_orderbook_api",
          `Build OpenSea trait offer error. offerer=${offerer}, quantity=${quantity}, collectionSlug=${collectionSlug}, traitType=${traitType}, traitValue=${traitValue}, apiKey=${apiKey}, error=${error}, responseStatus=${
            error.response?.status
          }, responseData=${JSON.stringify(error.response?.data)}`
        );

        if (error.response) {
          handleErrorResponse(error.response);
        }

        throw new Error(`Failed to build OpenSea trait offer`);
      })
  );
};

export const postCollectionOffer = async (
  order: Sdk.SeaportV14.Order,
  collectionSlug: string,
  apiKey: string
) => {
  const url = `${getOpenseaBaseUrl()}/v2/offers`;

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
      protocol_address: Sdk.SeaportV14.Addresses.Exchange[config.chainId],
    },
  });

  await axios
    .post(url, data, {
      headers:
        config.chainId != 5
          ? {
              "Content-Type": "application/json",
              "X-Api-Key": apiKey || config.openSeaApiKey,
            }
          : {
              "Content-Type": "application/json",
              // The request will fail if passing the API key on Opensea Testnet APIs
            },
    })
    .catch((error) => {
      logger.error(
        "opensea-orderbook-api",
        `Post OpenSea collection offer error. order=${JSON.stringify(
          order
        )}, collectionSlug=${collectionSlug}, apiKey=${apiKey}, data=${data}, error=${error}, responseStatus=${
          error.response?.status
        }, responseData=${JSON.stringify(error.response?.data)}`
      );

      if (error.response) {
        handleErrorResponse(error.response);
      }

      throw new Error(`Failed to post offer to OpenSea`);
    });
};

export const postTraitOffer = async (
  order: Sdk.SeaportV14.Order,
  collectionSlug: string,
  attribute: { key: string; value: string },
  apiKey: string
) => {
  const url = `https://${getOpenseaSubDomain()}.opensea.io/v2/offers`;
  const data = JSON.stringify({
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
      protocol_address: Sdk.SeaportV14.Addresses.Exchange[config.chainId],
    },
  });

  await axios
    .post(url, data, {
      headers:
        config.chainId != 5
          ? {
              "Content-Type": "application/json",
              "X-Api-Key": apiKey || config.openSeaApiKey,
            }
          : {
              "Content-Type": "application/json",
              // The request will fail if passing the API key on Opensea Testnet APIs
            },
    })
    .catch((error) => {
      logger.error(
        "opensea-orderbook-api",
        `Post OpenSea trait offer error. order=${JSON.stringify(
          order
        )}, collectionSlug=${collectionSlug}, apiKey=${apiKey}, data=${data}, error=${error}, responseStatus=${
          error.response?.status
        }, responseData=${JSON.stringify(error.response?.data)}`
      );

      if (error.response) {
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
    case 400: {
      const error = response.data.errors?.toString();
      const message = `Request was rejected by OpenSea. error=${error}`;

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
