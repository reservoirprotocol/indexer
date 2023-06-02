/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { buildContinuation, fromBuffer, regex } from "@/common/utils";
import { Activities } from "@/models/activities";
import {
  getJoiActivityOrderObject,
  getJoiPriceObject,
  JoiActivityOrder,
  JoiPrice,
} from "@/common/joi";

const version = "v5";

export const getActivityV5Options: RouteOptions = {
  description: "All activity",
  notes:
    "This API can be used to return all activity including sales, asks, transfers, mints, bids, cancelled bids, and cancelled asks.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    query: Joi.object({
      includeMetadata: Joi.boolean()
        .default(false)
        .description("If true, metadata is included in the response. If true, max limit is 50."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(20)
        .description(
          "Amount of items returned. Default is 20. Max is 1000 when `includeMetadata=false`"
        ),
      continuation: Joi.string().pattern(regex.base64),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Input any ERC20 address to return result in given currency"),
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
          type: Joi.string().description(
            "Possible types returned: `ask`, `ask_cancel`, `bid`, `bid_cancel`, `sale`, `mint, and `transfer`."
          ),
          contract: Joi.string(),
          collectionId: Joi.string().allow(null),
          tokenId: Joi.string().allow(null),
          fromAddress: Joi.string(),
          toAddress: Joi.string().allow(null),
          price: JoiPrice.allow(null).description(
            "Return native currency unless displayCurrency contract was passed."
          ),
          amount: Joi.number().unsafe(),
          timestamp: Joi.number().description("Time when added on the blockchain."),
          txHash: Joi.string()
            .lowercase()
            .pattern(regex.bytes32)
            .allow(null)
            .description("Txn hash from the blockchain."),
          logIndex: Joi.number().allow(null),
          batchIndex: Joi.number().allow(null),
          order: JoiActivityOrder,
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

      const result = _.map(activities, async (activity) => {
        return {
          id: Number(activity.id),
          type: activity.type,
          contract: activity.contract,
          collectionId: activity.collectionId,
          tokenId: activity.tokenId,
          fromAddress: activity.fromAddress,
          toAddress: activity.toAddress,
          // When creating a new version make sure price is always returned (https://linear.app/reservoir/issue/PLATF-1323/usersactivityv6-price-property-missing)
          price: activity.order?.currency
            ? await getJoiPriceObject(
                {
                  gross: {
                    amount: String(activity.order?.currencyPrice ?? activity.price),
                    nativeAmount: String(activity.price),
                  },
                },
                fromBuffer(activity.order.currency),
                query.displayCurrency
              )
            : undefined,
          amount: activity.amount,
          timestamp: activity.eventTimestamp,
          txHash: activity.metadata.transactionHash,
          logIndex: activity.metadata.logIndex,
          batchIndex: activity.metadata.batchIndex,
          order: activity.order?.id
            ? await getJoiActivityOrderObject({
                id: activity.order.id,
                side: activity.order.side,
                sourceIdInt: activity.order.sourceIdInt,
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
          continuation = buildContinuation(`${lastActivity.eventTimestamp}_${lastActivity.id}`);
        }
      }

      return { activities: await Promise.all(result), continuation };
    } catch (error) {
      logger.error(`get-activity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
