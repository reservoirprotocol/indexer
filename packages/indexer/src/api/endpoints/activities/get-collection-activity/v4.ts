/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { buildContinuation, formatEth, regex, splitContinuation } from "@/common/utils";
import { Activities } from "@/models/activities";
import { ActivityType } from "@/models/activities/activities-entity";
import { Sources } from "@/models/sources";
import { JoiOrderMetadata } from "@/common/joi";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { CollectionSets } from "@/models/collection-sets";
import * as Boom from "@hapi/boom";
import { Collections } from "@/models/collections";

const version = "v4";

export const getCollectionActivityV4Options: RouteOptions = {
  description: "Collection activity",
  notes: "This API can be used to build a feed for a collection",
  tags: ["api", "x-deprecated"],
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
    }).xor("collection", "collectionsSetId", "community"),
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
            metadata: JoiOrderMetadata.allow(null).optional(),
          }),
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

    try {
      if (query.es === "1" || config.enableElasticsearchRead) {
        if (query.collectionsSetId) {
          query.collection = await CollectionSets.getCollectionsIds(query.collectionsSetId);
          if (_.isEmpty(query.collection)) {
            throw Boom.badRequest(`No collections for collection set ${query.collectionsSetId}`);
          }
        }

        if (query.community) {
          query.collection = await Collections.getIdsByCommunity(query.community);

          if (query.collection.length === 0) {
            throw Boom.badRequest(`No collections for community ${query.community}`);
          }
        }

        const sources = await Sources.getInstance();

        const { activities, continuation } = await ActivitiesIndex.search({
          types: query.types,
          collections: [query.collection],
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

      const activities = await Activities.getCollectionActivities(
        query.collection,
        query.community,
        query.collectionsSetId,
        query.continuation,
        query.types,
        [],
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
                metadata: activity.order.metadata || undefined,
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
