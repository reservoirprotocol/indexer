/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { formatEth } from "@/common/utils";
import { Activities } from "@/models/activities";

const version = "v1";

export const getActivityV1Options: RouteOptions = {
  description: "All activity",
  notes: "This API can be used to scrape all of the activities",
  tags: ["api", "Activity"],
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
      continuation: Joi.number().allow(null),
      activities: Joi.array().items(
        Joi.object({
          id: Joi.number(),
          type: Joi.string(),
          contract: Joi.string(),
          collectionId: Joi.string().allow(null),
          tokenId: Joi.string().allow(null),
          fromAddress: Joi.string(),
          toAddress: Joi.string().allow(null),
          price: Joi.number(),
          amount: Joi.number(),
          timestamp: Joi.number(),
        })
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

      const result = _.map(activities, (activity) => ({
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
      }));

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
