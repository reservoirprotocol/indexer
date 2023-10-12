/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { logger } from "@/common/logger";
import { fromBuffer, regex } from "@/common/utils";
import { CollectionSets } from "@/models/collection-sets";
import * as Boom from "@hapi/boom";
import {
  getJoiActivityOrderObject,
  getJoiPriceObject,
  getJoiSourceObject,
  JoiActivityOrder,
  JoiPrice,
  JoiSource,
} from "@/common/joi";
import { ContractSets } from "@/models/contract-sets";
import { config } from "@/config/index";
import { ActivityType } from "@/elasticsearch/indexes/activities/base";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import * as Sdk from "@reservoir0x/sdk";
import { Collections } from "@/models/collections";
import { redis } from "@/common/redis";
import { redb } from "@/common/db";
import { Sources } from "@/models/sources";

const version = "v6";

export const getUserActivityV6Options: RouteOptions = {
  description: "Users activity",
  notes:
    "This API can be used to build a feed for a user including sales, asks, transfers, mints, bids, cancelled bids, and cancelled asks types.",
  tags: ["api", "Activity"],
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
              "Array of users addresses. Max is 50. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
            ),
          Joi.string()
            .lowercase()
            .pattern(regex.address)
            .description(
              "Array of users addresses. Max is 50. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
            )
        )
        .required(),
      collection: Joi.alternatives(
        Joi.array().items(Joi.string().lowercase()),
        Joi.string().lowercase()
      ).description(
        "Filter to one or more collections. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
      ),
      collectionsSetId: Joi.string()
        .lowercase()
        .description("Filter to a particular collection set."),
      contractsSetId: Joi.string().lowercase().description("Filter to a particular contracts set."),
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
          "Order the items are returned in the response. The blockchain event time is `eventTimestamp`. The event time recorded is `createdAt`."
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
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Input any ERC20 address to return result in given currency."),
    }).oxor("collection", "collectionsSetId", "contractsSetId", "community"),
  },
  response: {
    schema: Joi.object({
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
          contract: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/)
            .allow(null),
          token: Joi.object({
            tokenId: Joi.string().allow(null),
            tokenName: Joi.string().allow("", null),
            tokenImage: Joi.string().allow("", null),
            lastBuy: {
              value: Joi.number().unsafe().allow(null),
              timestamp: Joi.number().unsafe().allow(null),
            },
            lastSell: {
              value: Joi.number().unsafe().allow(null),
              timestamp: Joi.number().unsafe().allow(null),
            },
            tokenRarityScore: Joi.number()
              .allow(null)
              .description("No rarity for collections over 100k"),
            tokenRarityRank: Joi.number()
              .allow(null)
              .description("No rarity rank for collections over 100k"),
            tokenMedia: Joi.string().allow(null),
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
          fillSource: JoiSource.allow(null),
          order: JoiActivityOrder,
          createdAt: Joi.string(),
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

    if (query.collectionsSetId) {
      query.collection = await CollectionSets.getCollectionsIds(query.collectionsSetId);
      if (_.isEmpty(query.collection)) {
        throw Boom.badRequest(`No collections for collection set ${query.collectionsSetId}`);
      }
    }

    if (query.contractsSetId) {
      query.contracts = await ContractSets.getContracts(query.contractsSetId);
      if (_.isEmpty(query.contracts)) {
        throw Boom.badRequest(`No contracts for contracts set ${query.contractsSetId}`);
      }
    }

    try {
      if (query.collection && !_.isArray(query.collection)) {
        query.collection = [query.collection];
      }

      if (query.community) {
        query.collection = await Collections.getIdsByCommunity(query.community);

        if (query.collection.length === 0) {
          throw Boom.badRequest(`No collections for community ${query.community}`);
        }
      }

      const { activities, continuation } = await ActivitiesIndex.search({
        types: query.types,
        users: query.users,
        collections: query.collection,
        contracts: query.contracts,
        sortBy: query.sortBy === "eventTimestamp" ? "timestamp" : query.sortBy,
        limit: query.limit,
        continuation: query.continuation,
      });

      let tokensMetadata: any[] = [];

      if (query.includeMetadata) {
        try {
          let tokensToFetch = activities
            .filter((activity) => activity.token)
            .map((activity) => `token-cache:${activity.contract}:${activity.token?.id}`);

          if (tokensToFetch.length) {
            // Make sure each token is unique
            tokensToFetch = [...new Set(tokensToFetch).keys()];

            tokensMetadata = await redis.mget(tokensToFetch);
            tokensMetadata = tokensMetadata
              .filter((token) => token)
              .map((token) => JSON.parse(token));

            const nonCachedTokensToFetch = tokensToFetch.filter((tokenToFetch) => {
              const [, contract, tokenId] = tokenToFetch.split(":");

              return (
                tokensMetadata.find((token) => {
                  return token.contract === contract && token.token_id === tokenId;
                }) === undefined
              );
            });

            if (nonCachedTokensToFetch.length) {
              const tokensFilter = [];

              for (const nonCachedTokenToFetch of nonCachedTokensToFetch) {
                const [, contract, tokenId] = nonCachedTokenToFetch.split(":");

                tokensFilter.push(`('${_.replace(contract, "0x", "\\x")}', '${tokenId}')`);
              }

              // Fetch details for all tokens
              const tokensResult = await redb.manyOrNone(
                `
          SELECT
            tokens.contract,
            tokens.token_id,
            tokens.name,
            tokens.image
          FROM tokens
          WHERE (tokens.contract, tokens.token_id) IN ($/tokensFilter:raw/)
        `,
                { tokensFilter: _.join(tokensFilter, ",") }
              );

              if (tokensResult?.length) {
                tokensMetadata = tokensMetadata.concat(
                  tokensResult.map((token) => ({
                    contract: fromBuffer(token.contract),
                    token_id: token.token_id,
                    name: token.name,
                    image: token.image,
                  }))
                );

                const redisMulti = redis.multi();

                for (const tokenResult of tokensResult) {
                  const tokenResultContract = fromBuffer(tokenResult.contract);

                  await redisMulti.set(
                    `token-cache:${tokenResultContract}:${tokenResult.token_id}`,
                    JSON.stringify({
                      contract: tokenResultContract,
                      token_id: tokenResult.token_id,
                      name: tokenResult.name,
                      image: tokenResult.image,
                    })
                  );

                  await redisMulti.expire(
                    `token-cache:${tokenResultContract}:${tokenResult.token_id}`,
                    60 * 60 * 24
                  );
                }

                await redisMulti.exec();
              }
            }
          }
        } catch (error) {
          logger.error(`get-user-activity-${version}-handler`, `Token cache error: ${error}`);
        }
      }

      const result = _.map(activities, async (activity) => {
        const currency = activity.pricing?.currency
          ? activity.pricing.currency
          : Sdk.Common.Addresses.Native[config.chainId];

        const tokenMetadata = tokensMetadata?.find(
          (token) =>
            token.contract == activity.contract && `${token.token_id}` == activity.token?.id
        );

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
                name: tokenMetadata ? tokenMetadata.name : activity.token?.name,
                image: tokenMetadata ? tokenMetadata.image : activity.token?.image,
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
                sourceIdInt: null,
                criteria: undefined,
              })
            : undefined;
        }

        const sources = await Sources.getInstance();
        const fillSource = activity.event?.fillSourceId
          ? sources.get(activity.event?.fillSourceId)
          : undefined;

        return {
          type: activity.type,
          fromAddress: activity.fromAddress,
          toAddress: activity.toAddress || null,
          price: activity.pricing?.currency
            ? await getJoiPriceObject(
                {
                  gross: {
                    amount: String(activity.pricing?.currencyPrice ?? activity.pricing?.price),
                    nativeAmount: String(activity.pricing?.price),
                  },
                },
                currency,
                query.displayCurrency
              )
            : undefined,
          amount: Number(activity.amount),
          timestamp: activity.timestamp,
          createdAt: new Date(activity.createdAt).toISOString(),
          contract: activity.contract,
          token: {
            tokenId: activity.token?.id || null,
            tokenName: query.includeMetadata
              ? (tokenMetadata ? tokenMetadata.name : activity.token?.name) || null
              : undefined,
            tokenImage: query.includeMetadata
              ? (tokenMetadata ? tokenMetadata.image : activity.token?.image) || null
              : undefined,
            tokenMedia: query.includeMetadata ? null : undefined,
            tokenRarityRank: query.includeMetadata ? null : undefined,
            tokenRarityScore: query.includeMetadata ? null : undefined,
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
          fillSource: fillSource ? getJoiSourceObject(fillSource, false) : undefined,
          order,
        };
      });

      return { activities: await Promise.all(result), continuation };
    } catch (error) {
      logger.error(`get-user-activity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
