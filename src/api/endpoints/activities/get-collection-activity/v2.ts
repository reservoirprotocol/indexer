/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { buildContinuation, formatEth, regex, splitContinuation } from "@/common/utils";
import { Activities } from "@/models/activities";
import { ActivityType } from "@/models/activities/activities-entity";
import { Sources } from "@/models/sources";

const version = "v2";

export const getCollectionActivityV2Options: RouteOptions = {
  description: "Collection activity",
  notes: "This API can be used to build a feed for a collection",
  tags: ["api", "Activity"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    params: Joi.object({
      collection: Joi.string()
        .lowercase()
        .required()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
    query: Joi.object({
      limit: Joi.number()
        .integer()
        .min(1)
        .default(20)
        .description(
          "Amount of items returned in response. If `includeMetadata=true` max limit is 20, otherwise max limit is 1,000."
        )
        .when("includeMetadata", {
          is: true,
          then: Joi.number().integer().max(20),
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
    }),
  },
  response: {
    schema: Joi.object({
      continuation: Joi.string().allow(null),
      activities: Joi.array().items(
        Joi.object({
          type: Joi.string(),
          fromAddress: Joi.string(),
          toAddress: Joi.string().allow(null),
          price: Joi.number().unsafe(),
          amount: Joi.number().unsafe(),
          timestamp: Joi.number(),
          createdAt: Joi.string(),
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
          source: Joi.object().allow(null),
        })
      ),
    }).label(`getCollectionActivity${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-collection-activity-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    if (query.types && !_.isArray(query.types)) {
      query.types = [query.types];
    }

    if (query.continuation) {
      query.continuation = splitContinuation(query.continuation)[0];
    }

    try {
      const activities = await Activities.getCollectionActivities(
        params.collection,
        query.continuation,
        query.types,
        query.limit,
        query.sortBy,
        query.includeMetadata
      );

      // If no activities found
      if (!activities.length) {
        return { activities: [] };
      }

      const sources = await Sources.getInstance();

      const result = _.map(activities, (activity) => {
        const source = activity.metadata.orderSourceIdInt
          ? sources.get(activity.metadata.orderSourceIdInt)
          : undefined;

        return {
          type: activity.type,
          fromAddress: activity.fromAddress,
          toAddress: activity.toAddress,
          price: formatEth(activity.price),
          amount: activity.amount,
          timestamp: activity.eventTimestamp,
          createdAt: activity.createdAt.toISOString(),
          token: activity.token,
          collection: activity.collection,
          txHash: activity.metadata.transactionHash,
          logIndex: activity.metadata.logIndex,
          batchIndex: activity.metadata.batchIndex,
          source: source
            ? {
                domain: source?.domain,
                name: source?.metadata.title || source?.name,
                icon: source?.metadata.icon,
              }
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

      return { activities: result, continuation };
    } catch (error) {
      logger.error(`get-collection-activity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
