/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import * as Sdk from "@reservoir0x/sdk";
import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
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

import { ActivityType } from "@/elasticsearch/indexes/activities/base";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { Sources } from "@/models/sources";
import { MetadataStatus } from "@/models/metadata-status";
import { Assets } from "@/utils/assets";
import { ActivitiesCollectionCache } from "@/models/activities-collection-cache";
import { ActivitiesTokenCache } from "@/models/activities-token-cache";

const version = "v5";

export const getTokenActivityV5Options: RouteOptions = {
  description: "Token activity",
  notes:
    "This API can be used to build a feed for a token activity including sales, asks, transfers, mints, bids, cancelled bids, and cancelled asks types.",
  tags: ["api", "Activity"],
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
        .description("Amount of items returned. Default and max is 20."),
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
      excludeSpam: Joi.boolean()
        .default(false)
        .description("If true, will filter any activities marked as spam."),
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
    }),
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
            isSpam: Joi.boolean().default(false),
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

      const { activities, continuation } = await ActivitiesIndex.search({
        types: query.types,
        tokens: [{ contract, tokenId }],
        sortBy: query.sortBy === "eventTimestamp" ? "timestamp" : query.sortBy,
        limit: query.limit,
        continuation: query.continuation,
        excludeSpam: query.excludeSpam,
      });

      if (activities.length === 0) {
        return { activities: [], continuation: null };
      }

      let tokensMetadata: any[] = [];
      let collectionsMetadata: any[] = [];
      let disabledCollectionMetadata: any = {};

      if (query.includeMetadata) {
        disabledCollectionMetadata = await MetadataStatus.get(
          activities.map((activity) => activity.collection?.id ?? "")
        );

        try {
          tokensMetadata = await ActivitiesTokenCache.getTokens(activities);
        } catch (error) {
          logger.error(`get-collection-activity-${version}-handler`, `Token cache error: ${error}`);
        }

        try {
          collectionsMetadata = await ActivitiesCollectionCache.getCollections(activities);
        } catch (error) {
          logger.error(
            `get-collection-activity-${version}-handler`,
            `Collection cache error: ${error}`
          );
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

        const collectionMetadata = collectionsMetadata?.find(
          (collection) => collection.id == activity.collection?.id
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
                    name: collectionMetadata ? collectionMetadata.name : activity.collection?.name,
                    image: collectionMetadata
                      ? collectionMetadata.image
                      : activity.collection?.image,
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

        const originalImageUrl = query.includeMetadata
          ? tokenMetadata
            ? tokenMetadata.image
            : activity.token?.image
          : undefined;

        let tokenImageUrl = null;
        if (originalImageUrl) {
          tokenImageUrl = Assets.getResizedImageUrl(
            originalImageUrl,
            undefined,
            tokenMetadata?.image_version,
            tokenMetadata?.image_mime_type
          );
        }

        let collectionImageUrl = null;

        if (query.includeMetadata) {
          const collectionImage = collectionMetadata
            ? collectionMetadata.image
            : activity.collection?.image;

          if (collectionImage) {
            const collectionImageVersion = collectionMetadata
              ? collectionMetadata.image_version
              : activity.collection?.imageVersion;

            collectionImageUrl = Assets.getResizedImageUrl(
              collectionImage,
              undefined,
              collectionImageVersion
            );
          }
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
              tokenId: activity.token?.id,
              isSpam: activity.token?.isSpam,
              tokenName: query.includeMetadata
                ? tokenMetadata
                  ? tokenMetadata.name
                  : activity.token?.name
                : undefined,
              tokenImage: tokenImageUrl,
              rarityScore: tokenMetadata?.rarity_score,
              rarityRank: tokenMetadata?.rarity_rank,
            },
            collection: {
              collectionId: activity.collection?.id,
              isSpam: activity.collection?.isSpam,
              collectionName: query.includeMetadata
                ? collectionMetadata
                  ? collectionMetadata.name
                  : activity.collection?.name
                : undefined,
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
      logger.error(`get-token-activity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
