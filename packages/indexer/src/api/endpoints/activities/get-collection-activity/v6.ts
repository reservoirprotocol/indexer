/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { logger } from "@/common/logger";
import { buildContinuation, regex, splitContinuation } from "@/common/utils";
import { Activities } from "@/models/activities";
import { ActivityType } from "@/models/activities/activities-entity";
import {
  getJoiActivityOrderObject,
  getJoiPriceObject,
  JoiActivityOrder,
  JoiPrice,
} from "@/common/joi";
import { config } from "@/config/index";
import * as Sdk from "@reservoir0x/sdk";

const version = "v6";

export const getCollectionActivityV6Options: RouteOptions = {
  description: "Collection activity",
  notes: "This API can be used to build a feed for a collection",
  tags: ["api", "Activity"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    query: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      collectionsSetId: Joi.string()
        .lowercase()
        .description("Filter to a particular collection set."),
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community. Example: `artblocks`"),
      attributes: Joi.object()
        .unknown()
        .description(
          "Filter to a particular attribute. Note: Our docs do not support this parameter correctly. To test, you can use the following URL in your browser. Example: `https://api.reservoir.tools/owners/v1?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attributes[Type]=Original` or `https://api.reservoir.tools/owners/v1?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attributes[Type]=Original&attributes[Type]=Sibling`"
        ),
      limit: Joi.number()
        .integer()
        .min(1)
        .default(50)
        .description(
          "Amount of items returned in response. If `includeMetadata=true` max limit is 50, otherwise max limit is 1,000."
        )
        .when("includeMetadata", {
          is: true,
          then: Joi.number().integer().max(50),
          otherwise: Joi.number().integer().max(1000),
        }),
      sortBy: Joi.string()
        .valid("eventTimestamp", "createdAt")
        .default("eventTimestamp")
        .description(
          "Order the items are returned in the response, eventTimestamp = The blockchain event time, createdAt - The time in which event was recorded"
        ),
      continuation: Joi.string().description(
        "Use continuation token to request next offset of items."
      ),
      includeMetadata: Joi.boolean()
        .default(true)
        .description("If true, metadata is included in the response."),
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
        .description("Return result in given currency"),
    })
      .xor("collection", "collectionsSetId", "community")
      .with("attributes", "collection"),
  },
  response: {
    schema: Joi.object({
      continuation: Joi.string().allow(null),
      activities: Joi.array().items(
        Joi.object({
          type: Joi.string(),
          fromAddress: Joi.string(),
          toAddress: Joi.string().allow(null),
          price: JoiPrice.allow(null),
          amount: Joi.number().unsafe(),
          timestamp: Joi.number(),
          createdAt: Joi.string(),
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
          txHash: Joi.string().lowercase().pattern(regex.bytes32).allow(null),
          logIndex: Joi.number().allow(null),
          batchIndex: Joi.number().allow(null),
          order: JoiActivityOrder,
        })
      ),
    }).label(`getCollectionActivity${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-collection-activity-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    if (query.types && !_.isArray(query.types)) {
      query.types = [query.types];
    }

    if (query.continuation) {
      query.continuation = splitContinuation(query.continuation)[0];
    }

    try {
      const activities = await Activities.getCollectionActivities(
        query.collection,
        query.community,
        query.collectionsSetId,
        query.continuation,
        query.types,
        query.attributes,
        query.limit,
        query.sortBy,
        query.includeMetadata,
        true
      );

      // If no activities found
      if (!activities.length) {
        return { activities: [] };
      }

      const result = _.map(activities, async (activity) => {
        return {
          type: activity.type,
          fromAddress: activity.fromAddress,
          toAddress: activity.toAddress,
          price: activity.order
            ? await getJoiPriceObject(
                {
                  gross: {
                    amount: String(activity.price),
                    nativeAmount: String(activity.price),
                  },
                },
                Sdk.Common.Addresses.Eth[config.chainId],
                query.displayCurrency
              )
            : undefined,
          amount: activity.amount,
          timestamp: activity.eventTimestamp,
          createdAt: activity.createdAt.toISOString(),
          contract: activity.contract,
          token: {
            tokenId: activity.token?.tokenId,
            tokenName: activity.token?.tokenName,
            tokenImage: activity.token?.tokenImage,
          },
          collection: activity.collection,
          txHash: activity.metadata.transactionHash,
          logIndex: activity.metadata.logIndex,
          batchIndex: activity.metadata.batchIndex,
          order: activity.order?.id
            ? await getJoiActivityOrderObject({
                id: activity.order.id,
                side: activity.order.side,
                sourceIdInt: activity.order.sourceIdInt || activity.metadata.orderSourceIdInt,
                criteria: activity.order.criteria,
              })
            : undefined,
        };
      });

      // Set the continuation node
      let continuation = null;
      if (activities.length === query.limit) {
        const lastActivity = _.last(activities);

        if (lastActivity) {
          const continuationValue =
            query.sortBy == "eventTimestamp"
              ? lastActivity.eventTimestamp
              : lastActivity.createdAt.toISOString();
          continuation = buildContinuation(`${continuationValue}`);
        }
      }

      return { activities: await Promise.all(result), continuation };
    } catch (error) {
      logger.error(`get-collection-activity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
