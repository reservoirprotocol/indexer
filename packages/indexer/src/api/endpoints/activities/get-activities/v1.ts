/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { formatEth, regex } from "@/common/utils";
import { Activities } from "@/models/activities";
import { Sources } from "@/models/sources";

const version = "v1";

export const getActivityV1Options: RouteOptions = {
  description: "All activity",
  notes: "This API can be used to scrape all of the activities",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(1000).default(20),
      continuation: Joi.number(),
    }),
  },
  response: {
    schema: Joi.object({
      continuation: Joi.number()
        .allow(null)
        .description("Use continuation token to request next offset of items."),
      activities: Joi.array().items(
        Joi.object({
          id: Joi.number(),
          type: Joi.string(),
          contract: Joi.string(),
          collectionId: Joi.string().allow(null),
          tokenId: Joi.string().allow(null),
          fromAddress: Joi.string(),
          toAddress: Joi.string().allow(null),
          price: Joi.number().unsafe(),
          amount: Joi.number().unsafe(),
          timestamp: Joi.number(),
          txHash: Joi.string().lowercase().pattern(regex.bytes32).allow(null),
          logIndex: Joi.number().allow(null),
          batchIndex: Joi.number().allow(null),
          source: Joi.object().allow(null),
        }).description("Amount of items returned in response.")
      ),
    }).label(`getActivity${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-activity-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const activities = await Activities.getActivities(query.continuation, query.limit);

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
          id: Number(activity.id),
          type: activity.type,
          contract: activity.contract,
          collectionId: activity.collectionId,
          tokenId: activity.tokenId,
          fromAddress: activity.fromAddress,
          toAddress: activity.toAddress,
          price: formatEth(activity.price),
          amount: activity.amount,
          timestamp: activity.eventTimestamp,
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
          continuation = Number(lastActivity.id);
        }
      }

      return { activities: result, continuation };
    } catch (error) {
      logger.error(`get-activity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
