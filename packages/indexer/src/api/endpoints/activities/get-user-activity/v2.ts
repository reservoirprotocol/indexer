/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { formatEth, regex } from "@/common/utils";
import { ActivityType } from "@/models/activities/activities-entity";
import { UserActivities } from "@/models/user-activities";
import { Sources } from "@/models/sources";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { config } from "@/config/index";

const version = "v2";

export const getUserActivityV2Options: RouteOptions = {
  description: "Users activity",
  notes: "This API can be used to build a feed for a user",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    query: Joi.object({
      users: Joi.alternatives()
        .try(
          Joi.array()
            .items(Joi.string().lowercase().pattern(regex.address))
            .min(1)
            .max(50)
            .description(
              "Array of users addresses. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
            ),
          Joi.string()
            .lowercase()
            .pattern(regex.address)
            .description(
              "Array of users addresses. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
            )
        )
        .required(),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(20)
        .default(20)
        .description("Amount of items returned in response."),
      continuation: Joi.number().description(
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
    }).options({ allowUnknown: true, stripUnknown: false }),
  },
  response: {
    schema: Joi.object({
      es: Joi.boolean().default(false),
      continuation: Joi.number().allow(null),
      activities: Joi.array().items(
        Joi.object({
          type: Joi.string(),
          fromAddress: Joi.string(),
          toAddress: Joi.string().allow(null),
          price: Joi.number().unsafe(),
          amount: Joi.number().unsafe(),
          timestamp: Joi.number(),
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
    }).label(`getUserActivity${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-user-activity-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    if (query.types && !_.isArray(query.types)) {
      query.types = [query.types];
    }

    if (!_.isArray(query.users)) {
      query.users = [query.users];
    }

    try {
      if (query.es !== "0" && config.enableElasticsearchRead) {
        const sources = await Sources.getInstance();

        const { activities, continuation } = await ActivitiesIndex.search({
          types: query.types,
          users: query.users,
          sortBy: "timestamp",
          limit: query.limit,
          continuation: query.continuation,
          continuationAsInt: true,
        });

        const result = _.map(activities, (activity) => {
          const source = activity.order?.sourceId
            ? sources.get(activity.order.sourceId)
            : undefined;

          return {
            type: activity.type,
            fromAddress: activity.fromAddress,
            toAddress: activity.toAddress || null,
            price: formatEth(activity.pricing?.price || 0),
            amount: Number(activity.amount),
            timestamp: activity.timestamp,
            token: {
              tokenId: activity.token?.id || null,
              tokenName: query.includeMetadata ? activity.token?.name || null : undefined,
              tokenImage: query.includeMetadata ? activity.token?.image || null : undefined,
            },
            collection: {
              collectionId: activity.collection?.id,
              collectionName: activity.collection?.name,
              collectionImage:
                activity.collection?.image != null ? activity.collection?.image : undefined,
            },
            txHash: activity.event?.txHash,
            logIndex: activity.event?.logIndex,
            batchIndex: activity.event?.batchIndex,
            source: source
              ? {
                  domain: source?.domain,
                  name: source?.getTitle(),
                  icon: source?.getIcon(),
                }
              : undefined,
          };
        });

        return {
          activities: result,
          continuation: continuation ? Number(continuation) : null,
          es: true,
        };
      }

      const activities = await UserActivities.getActivities(
        query.users,
        [],
        "",
        query.continuation,
        query.types,
        query.limit
      );

      // If no activities found
      if (!activities.length) {
        return { activities: [] };
      }

      const sources = await Sources.getInstance();

      // Iterate over the activities
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
          token: {
            tokenId: activity.token?.tokenId,
            tokenName: activity.token?.tokenName,
            tokenImage: activity.token?.tokenImage,
          },
          collection: activity.collection,
          txHash: activity.metadata.transactionHash,
          logIndex: activity.metadata.logIndex,
          batchIndex: activity.metadata.batchIndex,
          source: source
            ? {
                domain: source?.domain,
                name: source?.getTitle(),
                icon: source?.getIcon(),
              }
            : undefined,
        };
      });

      // Set the continuation node
      let continuation = null;
      if (activities.length === query.limit) {
        const lastActivity = _.last(activities);

        if (lastActivity) {
          continuation = lastActivity.eventTimestamp;
        }
      }

      return { activities: result, continuation };
    } catch (error) {
      logger.error(`get-user-activity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
