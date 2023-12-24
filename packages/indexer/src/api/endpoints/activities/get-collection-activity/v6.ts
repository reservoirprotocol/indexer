/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { logger } from "@/common/logger";
import { fromBuffer, regex } from "@/common/utils";
import {
  getJoiActivityObject,
  getJoiActivityOrderObject,
  getJoiCollectionObject,
  getJoiPriceObject,
  getJoiSourceObject,
  getJoiTokenObject,
  JoiActivityOrder,
  JoiPrice,
  JoiSource,
} from "@/common/joi";
import { config } from "@/config/index";
import * as Sdk from "@reservoir0x/sdk";
import { CollectionSets } from "@/models/collection-sets";
import * as Boom from "@hapi/boom";
import { Collections } from "@/models/collections";
import { ActivityType } from "@/elasticsearch/indexes/activities/base";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { redb } from "@/common/db";
import { redis } from "@/common/redis";
import { Sources } from "@/models/sources";
import { MetadataStatus } from "@/models/metadata-status";
import { Assets, ImageSize } from "@/utils/assets";
import { ApiKeyManager } from "@/models/api-keys";

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
      excludeSpam: Joi.boolean()
        .default(false)
        .description("If true, will filter any activities marked as spam."),
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
      .with("attributes", "collection"),
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
          createdAt: Joi.string().description("Time when added in the indexer."),
          contract: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/)
            .allow(null),
          token: Joi.object({
            tokenId: Joi.string().allow(null),
            tokenName: Joi.string().allow("", null),
            tokenImage: Joi.string().allow("", null),
            isSpam: Joi.boolean().allow("", null),
            rarityScore: Joi.number().allow(null),
            rarityRank: Joi.number().allow(null),
          }),
          collection: Joi.object({
            collectionId: Joi.string().allow(null),
            collectionName: Joi.string().allow("", null),
            collectionImage: Joi.string().allow("", null),
            isSpam: Joi.boolean().allow("", null),
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
    const apiKey = await ApiKeyManager.getApiKey(request.headers["x-api-key"]);
    const debug = apiKey?.key ? config.debugApiKeys.includes(apiKey.key) : false;

    if (debug) {
      logger.info(
        `get-collection-activity-${version}-handler`,
        JSON.stringify({
          message: `Debug apiKey.`,
          query,
          apiKey,
        })
      );
    }

    if (query.types && !_.isArray(query.types)) {
      query.types = [query.types];
    }

    try {
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

      const { activities, continuation } = await ActivitiesIndex.search(
        {
          types: query.types,
          contracts,
          tokens,
          excludeSpam: query.excludeSpam,
          collections: query.collection,
          sortBy: query.sortBy === "eventTimestamp" ? "timestamp" : query.sortBy,
          limit: query.limit,
          continuation: query.continuation,
        },
        debug
      );

      let tokensMetadata: any[] = [];
      let disabledCollectionMetadata: any = {};

      if (query.includeMetadata) {
        try {
          let tokensToFetch = activities
            .filter((activity) => activity.token)
            .map((activity) => `token-cache:${activity.contract}:${activity.token?.id}`);

          disabledCollectionMetadata = await MetadataStatus.get(
            activities.map((activity) => activity.collection?.id ?? "")
          );

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
            tokens.image,
            tokens.image_version,
            tokens.metadata_disabled,
            tokens.rarity_score,
            tokens.rarity_rank
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
                    image_version: token.image_version,
                    metadata_disabled: token.metadata_disabled,
                    rarity_score: token.rarity_score,
                    rarity_rank: token.rarity_rank,
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
                      image_version: tokenResult.image_version,
                      metadata_disabled: tokenResult.metadata_disabled,
                      rarity_score: tokenResult.rarity_score,
                      rarity_rank: tokenResult.rarity_rank,
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
          logger.error(`get-collection-activity-${version}-handler`, `Token cache error: ${error}`);
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
                collection: getJoiCollectionObject(
                  {
                    id: activity.collection?.id,
                    name: activity.collection?.name,
                    image: activity.collection?.image,
                    isSpam: activity.collection?.isSpam,
                  },
                  disabledCollectionMetadata[activity.collection?.id ?? ""],
                  activity.contract
                ),
              },
            };

            if (activity.order.criteria.kind === "token") {
              (orderCriteria as any).data.token = getJoiTokenObject(
                {
                  tokenId: activity.token?.id,
                  name: tokenMetadata ? tokenMetadata.name : activity.token?.name,
                  image: tokenMetadata ? tokenMetadata.image : activity.token?.image,
                  isSpam: activity.token?.isSpam,
                },
                tokenMetadata?.metadata_disabled ||
                  disabledCollectionMetadata[activity.collection?.id ?? ""],
                true
              );
            }

            if (activity.order.criteria.kind === "attribute") {
              (orderCriteria as any).data.attribute = activity.order.criteria.data.attribute;
            }

            if (activity.order.criteria.kind === "custom") {
              delete (orderCriteria as any).data.collection;
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

        const sources = await Sources.getInstance();
        const fillSource = activity.event?.fillSourceId
          ? sources.get(activity.event?.fillSourceId)
          : undefined;

        const originalImageUrl = query.includeMetadata
          ? (tokenMetadata ? tokenMetadata.image : activity.token?.image) || null
          : undefined;

        let tokenImageUrl = null;
        if (originalImageUrl) {
          tokenImageUrl = Assets.getResizedImageUrl(
            originalImageUrl,
            undefined,
            tokenMetadata?.image_version
          );
        }

        let collectionImageUrl = null;
        if (query.includeMetadata && activity.collection?.image) {
          collectionImageUrl = Assets.getResizedImageUrl(
            activity.collection?.image,
            ImageSize.small,
            activity.collection?.imageVersion
          );
        }

        return getJoiActivityObject(
          {
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
              isSpam: activity.token?.isSpam,
              tokenName: query.includeMetadata
                ? (tokenMetadata ? tokenMetadata.name : activity.token?.name) || null
                : undefined,
              tokenImage: tokenImageUrl,
              rarityScore: tokenMetadata?.rarity_score,
              rarityRank: tokenMetadata?.rarity_rank,
            },
            collection: {
              collectionId: activity.collection?.id,
              isSpam: activity.collection?.isSpam,
              collectionName: query.includeMetadata ? activity.collection?.name : undefined,
              collectionImage: collectionImageUrl,
            },
            txHash: activity.event?.txHash,
            logIndex: activity.event?.logIndex,
            batchIndex: activity.event?.batchIndex,
            fillSource: fillSource ? getJoiSourceObject(fillSource, false) : undefined,
            order,
          },
          tokenMetadata?.metadata_disabled,
          disabledCollectionMetadata
        );
      });

      return { activities: await Promise.all(result), continuation };
    } catch (error) {
      logger.error(`get-collection-activity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
