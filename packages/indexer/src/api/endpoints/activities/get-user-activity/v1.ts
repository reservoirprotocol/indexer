/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { formatEth, regex } from "@/common/utils";
import { ActivityType } from "@/models/activities/activities-entity";
import { UserActivities } from "@/models/user-activities";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

const version = "v1";

export const getUserActivityV1Options: RouteOptions = {
  description: "User activity",
  notes: "This API can be used to build a feed for a user",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .required()
        .description(
          "Filter to a particular user. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
    }),
    query: Joi.object({
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
            tokenName: Joi.string().allow(null),
            tokenImage: Joi.string().allow(null),
          }),
          collection: Joi.object({
            collectionId: Joi.string().allow(null),
            collectionName: Joi.string().allow(null),
            collectionImage: Joi.string().allow(null),
          }),
          txHash: Joi.string().lowercase().pattern(regex.bytes32).allow(null),
          logIndex: Joi.number().allow(null),
          batchIndex: Joi.number().allow(null),
        })
      ),
    }).label(`getUserActivity${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-user-activity-${version}-handler`, `Wrong response schema: ${error}`);
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
      if (query.es !== "0" && config.enableElasticsearchRead) {
        const { activities, continuation } = await ActivitiesIndex.search({
          types: query.types,
          users: [params.user],
          sortBy: "timestamp",
          limit: query.limit,
          continuation: query.continuation,
          continuationAsInt: true,
        });

        const result = _.map(activities, (activity) => {
          return {
            type: activity.type,
            fromAddress: activity.fromAddress,
            toAddress: activity.toAddress || null,
            price: formatEth(activity.pricing?.price || 0),
            amount: Number(activity.amount),
            timestamp: activity.timestamp,
            token: {
              tokenId: activity.token?.id,
              tokenName: activity.token?.name,
              tokenImage: activity.token?.image,
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
          };
        });

        return {
          activities: result,
          continuation: continuation ? Number(continuation) : null,
          es: true,
        };
      }

      const activities = await UserActivities.getActivities(
        [params.user],
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

      // Iterate over the activities
      const result = _.map(activities, (activity) => ({
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
      }));

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
