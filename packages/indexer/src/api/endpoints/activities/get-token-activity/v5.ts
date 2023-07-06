/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import * as Sdk from "@reservoir0x/sdk";
import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import {
  getJoiActivityOrderObject,
  getJoiPriceObject,
  JoiActivityOrder,
  JoiPrice,
} from "@/common/joi";
import { config } from "@/config/index";

import { ActivityType } from "@/elasticsearch/indexes/activities/base";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

const version = "v5";

export const getTokenActivityV5Options: RouteOptions = {
  description: "Token activity",
  notes:
    "This API can be used to build a feed for a token activity including sales, asks, transfers, mints, bids, cancelled bids, and cancelled asks types.",
  tags: ["api", "Activity"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    params: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        )
        .required(),
    }),
    query: Joi.object({
      limit: Joi.number()
        .integer()
        .min(1)
        .max(20)
        .default(20)
        .description("Amount of items returned. Default and max is 20."),
      sortBy: Joi.string()
        .valid("eventTimestamp", "createdAt")
        .default("eventTimestamp")
        .description(
          "Order the items are returned in the response. The blockchain event time is `eventTimestamp`. The event time recorded is `createdAt`."
        ),
      includeMetadata: Joi.boolean()
        .default(true)
        .description("If true, metadata is included in the response."),
      continuation: Joi.string().description(
        "Use continuation token to request next offset of items."
      ),
      types: Joi.alternatives()
        .try(
          Joi.array().items(
            Joi.string()
              .lowercase()
              .valid(..._.values(ActivityType))
          ),
          Joi.string()
            .lowercase()
            .valid(..._.values(ActivityType))
        )
        .description("Types of events returned in response. Example: 'types=sale'"),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Input any ERC20 address to return result in given currency"),
    }),
  },
  response: {
    schema: Joi.object({
      continuation: Joi.string().allow(null),
      activities: Joi.array().items(
        Joi.object({
          type: Joi.string().description(
            "Possible types returned: `ask`, `ask_cancel`, `bid`, `bid_cancel`, `sale`, `mint, and `transfer`."
          ),
          fromAddress: Joi.string(),
          toAddress: Joi.string().allow(null),
          price: JoiPrice.allow(null).description(
            "Return native currency unless displayCurrency contract was passed."
          ),
          amount: Joi.number().unsafe(),
          timestamp: Joi.number().description("Time when added on the blockchain."),
          createdAt: Joi.string().description("Time when added in the indexer."),
          contract: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/)
            .allow(null),
          token: Joi.object({
            tokenId: Joi.string().allow(null),
            tokenName: Joi.string().allow("", null),
            tokenImage: Joi.string().allow("", null),
          }),
          collection: Joi.object({
            collectionId: Joi.string().allow(null),
            collectionName: Joi.string().allow("", null),
            collectionImage: Joi.string().allow("", null),
          }),
          txHash: Joi.string()
            .lowercase()
            .pattern(regex.bytes32)
            .allow(null)
            .description("Txn hash from the blockchain."),
          logIndex: Joi.number().allow(null),
          batchIndex: Joi.number().allow(null),
          order: JoiActivityOrder,
        })
      ),
    }).label(`getTokenActivity${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-token-activity-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    if (query.types && !_.isArray(query.types)) {
      query.types = [query.types];
    }

    try {
      const [contract, tokenId] = params.token.split(":");

      const { activities, continuation } = await ActivitiesIndex.search({
        types: query.types,
        tokens: [{ contract, tokenId }],
        sortBy: query.sortBy === "eventTimestamp" ? "timestamp" : query.sortBy,
        limit: query.limit,
        continuation: query.continuation,
      });

      const result = _.map(activities, async (activity) => {
        const currency = activity.pricing?.currency
          ? activity.pricing.currency
          : Sdk.Common.Addresses.Eth[config.chainId];

        let order;

        if (query.includeMetadata) {
          let orderCriteria;

          if (activity.order?.criteria) {
            orderCriteria = {
              kind: activity.order.criteria.kind,
              data: {
                collection: {
                  id: activity.collection?.id,
                  name: activity.collection?.name,
                  image: activity.collection?.image,
                },
              },
            };

            if (activity.order.criteria.kind === "token") {
              (orderCriteria as any).data.token = {
                tokenId: activity.token?.id,
                name: activity.token?.name,
                image: activity.token?.image,
              };
            }

            if (activity.order.criteria.kind === "attribute") {
              (orderCriteria as any).data.attribute = activity.order.criteria.data.attribute;
            }
          }

          order = activity.order?.id
            ? await getJoiActivityOrderObject({
                id: activity.order.id,
                side: activity.order.side,
                sourceIdInt: activity.order.sourceId,
                criteria: orderCriteria,
              })
            : undefined;
        } else {
          order = activity.order?.id
            ? await getJoiActivityOrderObject({
                id: activity.order.id,
                side: null,
                sourceIdInt: null,
                criteria: undefined,
              })
            : undefined;
        }

        return {
          type: activity.type,
          fromAddress: activity.fromAddress,
          toAddress: activity.toAddress || null,
          price: await getJoiPriceObject(
            {
              gross: {
                amount: String(activity.pricing?.currencyPrice ?? activity.pricing?.price ?? 0),
                nativeAmount: String(activity.pricing?.price ?? 0),
              },
            },
            currency,
            query.displayCurrency
          ),
          amount: Number(activity.amount),
          timestamp: activity.timestamp,
          createdAt: new Date(activity.createdAt).toISOString(),
          contract: activity.contract,
          token: {
            tokenId: activity.token?.id,
            tokenName: query.includeMetadata ? activity.token?.name : undefined,
            tokenImage: query.includeMetadata ? activity.token?.image : undefined,
          },
          collection: {
            collectionId: activity.collection?.id,
            collectionName: query.includeMetadata ? activity.collection?.name : undefined,
            collectionImage:
              query.includeMetadata && activity.collection?.image != null
                ? activity.collection?.image
                : undefined,
          },
          txHash: activity.event?.txHash,
          logIndex: activity.event?.logIndex,
          batchIndex: activity.event?.batchIndex,
          order,
        };
      });

      return { activities: await Promise.all(result), continuation };
    } catch (error) {
      logger.error(`get-token-activity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
