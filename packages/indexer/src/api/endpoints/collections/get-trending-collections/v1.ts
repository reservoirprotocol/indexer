/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { logger } from "@/common/logger";
import { fromBuffer, regex, formatEth } from "@/common/utils";
import { redb } from "@/common/db";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { getStartTime } from "@/models/top-selling-collections/top-selling-collections";
import { chunk, flatMap } from "lodash";
import { redis } from "@/common/redis";

const REDIS_EXPIRATION = 60 * 60 * 24; // 24 hours
const REDIS_BATCH_SIZE = 100;

import {
  getTopSellingCollectionsV2 as getTopSellingCollections,
  TopSellingFillOptions,
} from "@/elasticsearch/indexes/activities";

import { getJoiPriceObject, JoiPrice } from "@/common/joi";
import { Sources } from "@/models/sources";

const version = "v1";

export const getTrendingCollectionsV1Options: RouteOptions = {
  cache: {
    expiresIn: 60 * 1000,
    privacy: "public",
  },
  description: "Top Selling Collections",
  notes: "Get top selling and minting collections",
  tags: ["api", "Collections"],
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  validate: {
    query: Joi.object({
      period: Joi.string()
        .valid("5m", "10m", "30m", "1h", "6h", "1d", "24h", "7d", "30d")
        .default("1d")
        .description("Time window to aggregate."),

      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(50)
        .description(
          "Amount of items returned in response. Default is 50 and max is 1000. Expected to be sorted and filtered on client side."
        ),
      sortBy: Joi.string().valid("volume", "sales").default("sales"),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
      useNonFlaggedFloorAsk: Joi.boolean()
        .when("normalizeRoyalties", {
          is: Joi.boolean().valid(true),
          then: Joi.valid(false),
        })
        .default(false)
        .description(
          "If true, return the non flagged floor ask. Supported only when `normalizeRoyalties` is false."
        ),
    }),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          id: Joi.string().description("Collection id"),
          name: Joi.string().allow("", null),
          image: Joi.string().allow("", null),
          banner: Joi.string().allow("", null),
          isSpam: Joi.boolean().default(false),
          description: Joi.string().allow("", null),
          primaryContract: Joi.string().lowercase().pattern(regex.address),
          contract: Joi.string().lowercase().pattern(regex.address),
          count: Joi.number().integer(),
          volume: Joi.number(),
          volumePercentChange: Joi.number().unsafe().allow(null),
          countPercentChange: Joi.number().unsafe().allow(null),
          creator: Joi.string().allow("", null),
          onSaleCount: Joi.number().integer(),
          floorAsk: {
            id: Joi.string().allow(null),
            sourceDomain: Joi.string().allow("", null),
            price: JoiPrice.allow(null),
            maker: Joi.string().lowercase().pattern(regex.address).allow(null),
            validFrom: Joi.number().unsafe().allow(null),
            validUntil: Joi.number().unsafe().allow(null),
            token: Joi.object({
              contract: Joi.string().lowercase().pattern(regex.address).allow(null),
              tokenId: Joi.string().pattern(regex.number).allow(null),
              name: Joi.string().allow(null),
              image: Joi.string().allow("", null),
            })
              .allow(null)
              .description("Lowest Ask Price."),
          },
          tokenCount: Joi.number().description("Total tokens within the collection."),
          ownerCount: Joi.number().description("Unique number of owners."),

          collectionVolume: Joi.object({
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
            allTime: Joi.number().unsafe().allow(null),
          }).description("Total volume in given time period."),

          volumeChange: Joi.object({
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
          }).description(
            "Total volume change X-days vs previous X-days. (e.g. 7day [days 1-7] vs 7day prior [days 8-14]). A value over 1 is a positive gain, under 1 is a negative loss. e.g. 1 means no change; 1.1 means 10% increase; 0.9 means 10% decrease."
          ),
        })
      ),
    }).label(`getTrendingCollections${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-trending-collections-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request, h) => {
    const { normalizeRoyalties, useNonFlaggedFloorAsk } = request.query;

    try {
      const collectionsResult = await getCollectionsResult(request);
      let collections = [];

      if (collectionsResult.length > 0) {
        const collectionsMetadata = await getCollectionsMetadata(collectionsResult);

        collections = await formatCollections(
          collectionsResult,
          collectionsMetadata,
          normalizeRoyalties,
          useNonFlaggedFloorAsk
        );
      }

      const response = h.response({ collections });
      return response;
    } catch (error) {
      logger.error(`get-trending-collections-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};

async function formatCollections(
  collectionsResult: any[],
  collectionsMetadata: Record<string, any>,
  normalizeRoyalties: boolean,
  useNonFlaggedFloorAsk: boolean
) {
  const sources = await Sources.getInstance();

  const collections = await Promise.all(
    collectionsResult.map(async (response: any) => {
      const metadata = collectionsMetadata[response.id] || {};
      let floorAsk;
      let prefix = "";

      if (normalizeRoyalties) {
        prefix = "normalized_";
      } else if (useNonFlaggedFloorAsk) {
        prefix = "non_flagged_";
      }

      const floorAskId = metadata[`${prefix}floor_sell_id`];
      const floorAskValue = metadata[`${prefix}floor_sell_value`];
      const floorAskCurrency = metadata.floor_sell_currency;
      const floorAskSource = metadata[`${prefix}floor_sell_source_id_int`];
      const floorAskCurrencyValue =
        metadata[`${normalizeRoyalties ? "normalized_" : ""}floor_sell_currency_value`];

      if (metadata) {
        floorAsk = {
          id: floorAskId,
          sourceDomain: sources.get(floorAskSource)?.domain,
          price: floorAskId
            ? await getJoiPriceObject(
                {
                  gross: {
                    amount: floorAskCurrencyValue ?? floorAskValue,
                    nativeAmount: floorAskValue || 0,
                  },
                },
                floorAskCurrency
              )
            : null,
        };
      }

      return {
        ...response,
        image: metadata?.metadata?.imageUrl,
        isSpam: Number(metadata.is_spam) > 0,
        name: metadata?.name || "",
        onSaleCount: Number(metadata.on_sale_count) || 0,
        volumeChange: {
          "1day": Number(metadata.day1_volume_change),
          "7day": Number(metadata.day7_volume_change),
          "30day": Number(metadata.day30_volume_change),
        },

        collectionVolume: {
          "1day": metadata.day1_volume ? formatEth(metadata.day1_volume) : null,
          "7day": metadata.day7_volume ? formatEth(metadata.day7_volume) : null,
          "30day": metadata.day30_volume ? formatEth(metadata.day30_volume) : null,
          allTime: metadata.all_time_volume ? formatEth(metadata.all_time_volume) : null,
        },

        tokenCount: Number(metadata.token_count || 0),
        ownerCount: Number(metadata.owner_count || 0),
        banner: metadata?.metadata?.bannerImageUrl,
        description: metadata?.metadata?.description,
        floorAsk,
      };
    })
  );

  return collections;
}

async function getCollectionsMetadata(collectionsResult: any[]) {
  const collectionIds = collectionsResult.map((collection: any) => collection.id);
  const collectionsToFetch = collectionIds.map((id: string) => `collection-cache:v2:${id}`);
  const batches = chunk(collectionsToFetch, REDIS_BATCH_SIZE);
  const tasks = batches.map(async (batch) => redis.mget(batch));
  const results = await Promise.all(tasks);

  const collectionMetadataCache = results
    .flat()
    .filter((result) => !!result)
    .map((result: any) => JSON.parse(result));

  logger.info(
    "trending-collections",
    `using ${collectionMetadataCache.length} collections from cache`
  );

  const collectionsToFetchFromDb = collectionIds.filter((id: string) => {
    return !collectionMetadataCache.find((cache: any) => cache.id === id);
  });

  let collectionMetadataResponse: any = [];
  if (collectionsToFetchFromDb.length > 0) {
    logger.info(
      "trending-collections",
      `Fetching ${collectionsToFetchFromDb.length} collections from DB`
    );

    const collectionIdList = collectionsToFetchFromDb.map((id: string) => `'${id}'`).join(", ");

    const baseQuery = `
    SELECT
      collections.id,
      collections.name,
      collections.contract,
      collections.creator,
      collections.token_count,
      collections.owner_count,
      collections.is_spam,
      collections.day1_volume_change,
      collections.day7_volume_change,
      collections.day30_volume_change,
      collections.day1_volume,
      collections.day7_volume,
      collections.day30_volume,
      collections.all_time_volume,
      json_build_object(
        'imageUrl', (collections.metadata ->> 'imageUrl')::TEXT,
        'bannerImageUrl', (collections.metadata ->> 'bannerImageUrl')::TEXT,
        'description', (collections.metadata ->> 'description')::TEXT
      ) AS metadata,
      collections.non_flagged_floor_sell_id,
      collections.non_flagged_floor_sell_value,
      collections.non_flagged_floor_sell_maker,
      collections.non_flagged_floor_sell_valid_between,
      collections.non_flagged_floor_sell_source_id_int,
      collections.floor_sell_id,
      collections.floor_sell_value,
      collections.floor_sell_maker,
      collections.floor_sell_valid_between,
      collections.floor_sell_source_id_int,
      collections.normalized_floor_sell_id,
      collections.normalized_floor_sell_value,
      collections.normalized_floor_sell_maker,
      collections.normalized_floor_sell_valid_between,
      collections.normalized_floor_sell_source_id_int,
      y.floor_sell_currency,
      y.normalized_floor_sell_currency_value,
      y.floor_sell_currency_value,
      collections.top_buy_id,
      collections.top_buy_value,
      collections.top_buy_maker,
      collections.top_buy_valid_between,

      collections.top_buy_source_id_int,

      (
            SELECT
              COUNT(*)
            FROM tokens
            WHERE tokens.collection_id = collections.id
              AND tokens.floor_sell_value IS NOT NULL
          ) AS on_sale_count
    FROM collections

    LEFT JOIN LATERAL (
      SELECT
        orders.currency AS floor_sell_currency,
        orders.currency_normalized_value AS normalized_floor_sell_currency_value,
        orders.currency_value AS floor_sell_currency_value
      FROM orders
      WHERE orders.id = collections.floor_sell_id
    ) y ON TRUE
    WHERE collections.id IN (${collectionIdList})
  `;

    collectionMetadataResponse = await redb.manyOrNone(baseQuery);

    // need to convert buffers before saving to redis
    collectionMetadataResponse = collectionMetadataResponse.map((metadata: any) => {
      const { contract, floor_sell_currency, ...rest } = metadata;

      return {
        ...rest,
        contract: fromBuffer(contract),
        floor_sell_currency: floor_sell_currency
          ? fromBuffer(floor_sell_currency)
          : Sdk.Common.Addresses.Native[config.chainId],
      };
    });

    const commands = flatMap(collectionMetadataResponse, (metadata: any) => {
      return [
        ["set", `collection-cache:v2:${metadata.id}`, JSON.stringify(metadata)],
        ["expire", `collection-cache:v2:${metadata.id}`, REDIS_EXPIRATION],
      ];
    });

    const commandBatches = chunk(commands, 500);

    for (const batch of commandBatches) {
      const redisMulti = redis.multi(batch as any);
      await redisMulti.exec();
    }
  }

  const collectionsMetadata: Record<string, any> = {};
  [...collectionMetadataResponse, ...collectionMetadataCache].forEach((metadata: any) => {
    collectionsMetadata[metadata.id] = metadata;
  });

  return collectionsMetadata;
}

async function getCollectionsResult(request: Request) {
  const { limit, sortBy } = request.query;
  const fillType = TopSellingFillOptions.sale;
  let collectionsResult = [];
  const period = request.query.period === "24h" ? "1d" : request.query.period;
  const cacheKey = `top-selling-collections:v2:${period}:${fillType}:${sortBy}`;
  const cachedResults = await redis.get(cacheKey);

  if (cachedResults) {
    collectionsResult = JSON.parse(cachedResults).slice(0, limit);
  } else {
    const startTime = getStartTime(period);
    collectionsResult = await getTopSellingCollections({
      startTime,
      fillType,
      limit,
      sortBy,
    });
  }

  return collectionsResult;
}
