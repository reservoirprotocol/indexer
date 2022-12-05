/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { buildContinuation, formatEth, regex } from "@/common/utils";
import { Activities } from "@/models/activities";
import { Sources } from "@/models/sources";
import { JoiOrderCriteria } from "@/common/joi";

const version = "v4";

export const getActivityV4Options: RouteOptions = {
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
      includeMetadata: Joi.boolean()
        .default(false)
        .description("If true, metadata is included in the response."),
      limit: Joi.number().integer().min(1).max(1000).default(20),
      continuation: Joi.string().pattern(regex.base64),
      sortDirection: Joi.string()
        .lowercase()
        .valid("asc", "desc")
        .default("desc")
        .description("Order the items are returned in the response."),
    }),
  },
  response: {
    schema: Joi.object({
      continuation: Joi.string().pattern(regex.base64).allow(null),
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
          order: Joi.object({
            id: Joi.string().allow(null),
            side: Joi.string().valid("ask", "bid").allow(null),
            source: Joi.object().allow(null),
            criteria: JoiOrderCriteria.allow(null),
          }),
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
      const activities = await Activities.getActivities(
        query.continuation,
        query.limit,
        true,
        query.includeMetadata,
        query.sortDirection,
        true
      );

      // If no activities found
      if (!activities.length) {
        return { activities: [] };
      }

      const sources = await Sources.getInstance();

      const result = _.map(activities, (activity) => {
        const orderSource = activity.order?.sourceIdInt
          ? sources.get(activity.order.sourceIdInt)
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
          order: activity.order?.id
            ? {
                id: activity.order.id,
                side: activity.order.side
                  ? activity.order.side === "sell"
                    ? "ask"
                    : "bid"
                  : undefined,
                source: orderSource
                  ? {
                      domain: orderSource?.domain,
                      name: orderSource?.getTitle(),
                      icon: orderSource?.getIcon(),
                    }
                  : undefined,
                criteria: activity.order.criteria,
              }
            : undefined,
        };
      });

      // Set the continuation node
      let continuation = null;
      if (activities.length === query.limit) {
        const lastActivity = _.last(activities);

        if (lastActivity) {
          continuation = buildContinuation(`${lastActivity.eventTimestamp}_${lastActivity.id}`);
        }
      }

      return { activities: result, continuation };
    } catch (error) {
      logger.error(`get-activity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
