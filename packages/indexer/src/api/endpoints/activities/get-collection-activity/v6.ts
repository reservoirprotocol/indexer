/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { logger } from "@/common/logger";
import { buildContinuation, fromBuffer, regex, splitContinuation } from "@/common/utils";
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
import { CollectionSets } from "@/models/collection-sets";
import * as Boom from "@hapi/boom";
import { Collections } from "@/models/collections";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { redb } from "@/common/db";

const version = "v6";

export const getCollectionActivityV6Options: RouteOptions = {
  description: "Collection activity",
  notes:
    "This API can be used to build a feed for a collection including sales, asks, transfers, mints, bids, cancelled bids, and cancelled asks types.",
  tags: ["api", "Activity"],
  timeout: {
    server: 20 * 1000,
  },
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
          "Filter to a particular attribute. Note: Our docs do not support this parameter correctly. To test, you can use the following URL in your browser. Example: `https://api.reservoir.tools/collections/activity/v6?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attribute[Type]=Original` or `https://api.reservoir.tools/collections/activity/v6?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attribute[Type]=Original&attribute[Type]=Sibling`"
        ),
      limit: Joi.number()
        .integer()
        .min(1)
        .default(50)
        .description(
          "Amount of items returned. Max limit is 50 when `includedMetadata=true` otherwise max limit is 1000."
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
          "Order the items are returned in the response. The blockchain event time is `eventTimestamp`. The event time recorded is `createdAt`."
        ),
      continuation: Joi.string().description(
        "Use continuation token to request next offset of items."
      ),
      includeMetadata: Joi.boolean()
        .default(true)
        .description("If true, metadata is included in the response. If true, max limit is 50."),
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
        .description("Input any ERC20 address to return result in given currency"),
    })
      .xor("collection", "collectionsSetId", "community")
      .with("attributes", "collection")
      .options({ allowUnknown: true, stripUnknown: false }),
  },
  response: {
    schema: Joi.object({
      es: Joi.boolean().default(false),
      continuation: Joi.string().allow(null),
      activities: Joi.array().items(
        Joi.object({
          type: Joi.string().description(
            "Possible types returned: `ask`, `ask_cancel`, `bid`, `bid_cancel`, `sale`, `mint, and `transfer`."
          ),
          fromAddress: Joi.string(),
          toAddress: Joi.string().allow(null),
          price: JoiPrice.allow(null).description(
            "Return native currency unless displayCurrency contract was passed."
          ),
          amount: Joi.number().unsafe(),
          timestamp: Joi.number().description("Time when added on the blockchain."),
          createdAt: Joi.string().description("Time when added in the indexer."),
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
          txHash: Joi.string()
            .lowercase()
            .pattern(regex.bytes32)
            .allow(null)
            .description("Txn hash from the blockchain."),
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

    try {
      if (query.es !== "0" && config.enableElasticsearchRead) {
        if (query.collection && !_.isArray(query.collection)) {
          query.collection = [query.collection];
        }

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

        const contracts: string[] = [];
        let tokens: { contract: string; tokenId: string }[] = [];

        if (query.attributes) {
          const attributes: string[] = [];

          Object.entries(query.attributes).forEach(([key, values]) => {
            (Array.isArray(values) ? values : [values]).forEach((value) =>
              attributes.push(`('${key}', '${value}')`)
            );
          });

          const tokensResult = await redb.manyOrNone(`
            SELECT contract, token_id
            FROM token_attributes
            WHERE collection_id IN ('${query.collection.join(",")}')
            AND (key, value) IN (${attributes.join(",")});
          `);

          if (tokensResult.length === 0) {
            throw Boom.badRequest(`No tokens for attributes ${query.attributes}`);
          }

          tokens = _.map(tokensResult, (token) => ({
            contract: fromBuffer(token.contract),
            tokenId: token.token_id,
          }));

          contracts.push(fromBuffer(tokensResult[0].contract));
        }

        const { activities, continuation } = await ActivitiesIndex.search({
          types: query.types,
          contracts,
          tokens,
          collections: query.collection,
          sortBy: query.sortBy === "eventTimestamp" ? "timestamp" : query.sortBy,
          limit: query.limit,
          continuation: query.continuation,
        });

        const result = _.map(activities, async (activity) => {
          const currency = activity.pricing?.currency
            ? activity.pricing.currency
            : Sdk.Common.Addresses.Eth[config.chainId];

          let order;

          if (query.includeMetadata) {
            let orderCriteria;

            if (activity.order?.criteria) {
              orderCriteria = {
                kind: activity.order.criteria.kind,
                data: {
                  collection: {
                    id: activity.collection?.id,
                    name: activity.collection?.name,
                    image: activity.collection?.image,
                  },
                },
              };

              if (activity.order.criteria.kind === "token") {
                (orderCriteria as any).data.token = {
                  tokenId: activity.token?.id,
                  name: activity.token?.name,
                  image: activity.token?.image,
                };
              }

              if (activity.order.criteria.kind === "attribute") {
                (orderCriteria as any).data.attribute = activity.order.criteria.data.attribute;
              }
            }

            order = activity.order?.id
              ? await getJoiActivityOrderObject({
                  id: activity.order.id,
                  side: activity.order.side,
                  sourceIdInt: activity.order.sourceId,
                  criteria: orderCriteria,
                })
              : undefined;
          } else {
            order = activity.order?.id
              ? await getJoiActivityOrderObject({
                  id: activity.order.id,
                  side: null,
                  sourceIdInt: activity.order.sourceId,
                  criteria: undefined,
                })
              : undefined;
          }

          return {
            type: activity.type,
            fromAddress: activity.fromAddress,
            toAddress: activity.toAddress || null,
            price: await getJoiPriceObject(
              {
                gross: {
                  amount: String(activity.pricing?.currencyPrice ?? activity.pricing?.price ?? 0),
                  nativeAmount: String(activity.pricing?.price ?? 0),
                },
              },
              currency,
              query.displayCurrency
            ),
            amount: Number(activity.amount),
            timestamp: activity.timestamp,
            createdAt: new Date(activity.createdAt).toISOString(),
            contract: activity.contract,
            token: {
              tokenId: activity.token?.id || null,
              tokenName: query.includeMetadata ? activity.token?.name || null : undefined,
              tokenImage: query.includeMetadata ? activity.token?.image || null : undefined,
            },
            collection: {
              collectionId: activity.collection?.id,
              collectionName: query.includeMetadata ? activity.collection?.name : undefined,
              collectionImage:
                query.includeMetadata && activity.collection?.image != null
                  ? activity.collection?.image
                  : undefined,
            },
            txHash: activity.event?.txHash,
            logIndex: activity.event?.logIndex,
            batchIndex: activity.event?.batchIndex,
            order,
          };
        });

        return { activities: await Promise.all(result), continuation, es: true };
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
          // When creating a new version make sure price is always returned (https://linear.app/reservoir/issue/PLATF-1323/usersactivityv6-price-property-missing)
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
