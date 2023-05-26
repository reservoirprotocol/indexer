/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { buildContinuation, formatEth, regex, splitContinuation } from "@/common/utils";
import { Activities } from "@/models/activities";
import { ActivityType } from "@/models/activities/activities-entity";
import { Sources } from "@/models/sources";
import { JoiOrderCriteria } from "@/common/joi";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

const version = "v4";

export const getTokenActivityV4Options: RouteOptions = {
  description: "Token activity",
  notes: "This API can be used to build a feed for a token",
  tags: ["api", "x-deprecated"],
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
        .description("Amount of items returned in response."),
      sortBy: Joi.string()
        .valid("eventTimestamp", "createdAt")
        .default("eventTimestamp")
        .description(
          "Order the items are returned in the response, eventTimestamp = The blockchain event time, createdAt - The time in which event was recorded"
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
    }),
  },
  response: {
    schema: Joi.object({
      es: Joi.boolean().default(false),
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
          order: Joi.object({
            id: Joi.string().allow(null),
            side: Joi.string().valid("ask", "bid").allow(null),
            source: Joi.object().allow(null),
            criteria: JoiOrderCriteria.allow(null),
          }),
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

      if (query.es === "1" || config.enableElasticsearchRead) {
        const sources = await Sources.getInstance();

        const { activities, continuation } = await ActivitiesIndex.search({
          types: query.types,
          tokens: [{ contract, tokenId }],
          sortBy: query.sortBy === "eventTimestamp" ? "timestamp" : query.sortBy,
          limit: query.limit,
          continuation: query.continuation,
        });

        const result = _.map(activities, (activity) => {
          const orderSource = activity.order?.sourceId
            ? sources.get(activity.order.sourceId)
            : undefined;

          const orderCriteria = activity.order?.criteria
            ? {
                kind: activity.order.criteria.kind,
                data: {
                  collectionId: activity.collection?.id,
                  collectionName: activity.collection?.name,
                  tokenId: activity.token?.id,
                  tokenName: activity.token?.name,
                  image:
                    activity.order.criteria.kind === "token"
                      ? activity.token?.image
                      : activity.collection?.image,
                  attributes: activity.order.criteria.data.attribute
                    ? [activity.order.criteria.data.attribute]
                    : undefined,
                },
              }
            : undefined;

          return {
            type: activity.type,
            fromAddress: activity.fromAddress,
            toAddress: activity.toAddress || null,
            price: formatEth(activity.pricing?.price || 0),
            amount: Number(activity.amount),
            timestamp: activity.timestamp,
            createdAt: activity.createdAt.toISOString(),
            contract: activity.contract,
            token: {
              tokenId: activity.token?.id,
              tokenName: activity.token?.name,
              tokenImage: activity.token?.image,
            },
            collection: {
              collectionId: activity.collection?.id,
              collectionName: activity.collection?.name,
              collectionImage: activity.collection?.image,
            },
            txHash: activity.event?.txHash,
            logIndex: activity.event?.logIndex,
            batchIndex: activity.event?.batchIndex,
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
                  metadata: orderCriteria,
                }
              : undefined,
          };
        });

        return { activities: result, continuation, es: true };
      }

      if (query.continuation) {
        query.continuation = splitContinuation(query.continuation)[0];
      }

      const activities = await Activities.getTokenActivities(
        contract,
        tokenId,
        query.continuation,
        query.types,
        query.limit,
        query.sortBy,
        query.includeMetadata,
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
          type: activity.type,
          fromAddress: activity.fromAddress,
          toAddress: activity.toAddress,
          price: formatEth(activity.price),
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
          const continuationValue =
            query.sortBy == "eventTimestamp"
              ? lastActivity.eventTimestamp
              : lastActivity.createdAt.toISOString();
          continuation = buildContinuation(`${continuationValue}`);
        }
      }

      return { activities: result, continuation };
    } catch (error) {
      logger.error(`get-token-activity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
