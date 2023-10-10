/* eslint-disable @typescript-eslint/no-explicit-any */

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer, regex } from "@/common/utils";
import { config } from "@/config/index";
import { getStartTime } from "@/models/top-selling-collections/top-selling-collections";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { redis } from "@/common/redis";

const REDIS_EXPIRATION = 60 * 60 * 24; // 24 hours

import { getTrendingMints } from "@/elasticsearch/indexes/activities";

import { getJoiPriceObject, JoiPrice } from "@/common/joi";
import { Sources } from "@/models/sources";

const version = "v1";

export const getTrendingMintsV1Options: RouteOptions = {
  description: "Top Trending Mints",
  notes: "Get top trending mints",
  tags: ["api", "mints"],
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  validate: {
    query: Joi.object({
      period: Joi.string()
        .valid("5m", "10m", "30m", "1h", "2h", "6h", "24h")
        .default("24h")
        .description("Time window to aggregate."),
      type: Joi.string()
        .valid("free", "paid", "any")
        .default("any")
        .description("The type of the mint (free/paid)."),
      status: Joi.string()
        .allow("active", "inactive")
        .default("any")
        .description("The collection's minting status."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(50)
        .default(50)
        .description(
          "Amount of items returned in response. Default is 50 and max is 50. Expected to be sorted and filtered on client side."
        ),
    }),
  },
  response: {
    schema: Joi.object({
      mints: Joi.array().items(
        Joi.object({
          id: Joi.string().description("Collection id"),
          name: Joi.string().allow("", null),
          image: Joi.string().allow("", null),
          banner: Joi.string().allow("", null),
          description: Joi.string().allow("", null),
          primaryContract: Joi.string().lowercase().pattern(regex.address),
          count: Joi.number().integer(),
          volume: Joi.number(),
          mints: Joi.number(),
          creator: Joi.string().allow("", null),
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
          mintType: Joi.string().allow("free", "paid", "", null),
          mintStatus: Joi.string().allow("", null),
          mintStages: Joi.array().items(
            Joi.object({
              stage: Joi.string().allow(null),
              tokenId: Joi.string().pattern(regex.number).allow(null),
              kind: Joi.string().required(),
              price: JoiPrice.allow(null),
              startTime: Joi.number().allow(null),
              endTime: Joi.number().allow(null),
              maxMintsPerWallet: Joi.number().unsafe().allow(null),
            })
          ),
          tokenCount: Joi.number().description("Total tokens within the collection."),
          ownerCount: Joi.number().description("Unique number of owners."),
          volumeChange: Joi.object({
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
            allTime: Joi.number().unsafe().allow(null),
          }).description(
            "Total volume chang e X-days vs previous X-days. (e.g. 7day [days 1-7] vs 7day prior [days 8-14]). A value over 1 is a positive gain, under 1 is a negative loss. e.g. 1 means no change; 1.1 means 10% increase; 0.9 means 10% decrease."
          ),
        })
      ),
    }).label(`getTrendingMints${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-trending-mints-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request, h) => {
    const { normalizeRoyalties, useNonFlaggedFloorAsk, status } = request.query;

    try {
      const mintsResult = await getMintsResult(request);

      const collectionsMetadata = await getCollectionsMetadata(mintsResult, status);

      const mints = await formatCollections(
        mintsResult,
        collectionsMetadata,
        normalizeRoyalties,
        useNonFlaggedFloorAsk
      );

      const response = h.response({ mints });
      return response;
    } catch (error) {
      logger.error(`get-trending-mints-${version}-handler`, `Handler failure: ${error}`);
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
  const metadataKeys = Object.keys(collectionsMetadata);

  const collections = await Promise.all(
    collectionsResult
      .filter((res) => {
        if (metadataKeys.includes(res.id)) {
          return res;
        }
      })
      .map(async (response: any) => {
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
        let floorAskCurrency = metadata[`${prefix}floor_sell_currency`];
        const floorAskSource = metadata[`${prefix}floor_sell_source_id_int`];
        const floorAskCurrencyValue = metadata[`${prefix}floor_sell_currency_value`];

        if (metadata) {
          floorAskCurrency = floorAskCurrency
            ? fromBuffer(floorAskCurrency)
            : Sdk.Common.Addresses.Native[config.chainId];
          floorAsk = {
            id: floorAskId,
            sourceDomain: sources.get(floorAskSource)?.domain,
            price: metadata.floor_sell_id
              ? await getJoiPriceObject(
                  {
                    gross: {
                      amount: floorAskCurrencyValue ?? floorAskValue,
                      nativeAmount: floorAskValue,
                    },
                  },
                  floorAskCurrency
                )
              : null,
          };
        }
        const mintStages = metadata.mint_stages
          ? await Promise.all(
              metadata.mint_stages.map(async (m: any) => {
                return {
                  stage: m?.stage || null,
                  kind: m?.kind || null,
                  tokenId: m?.tokenId || null,
                  price: m?.price
                    ? await getJoiPriceObject({ gross: { amount: m.price } }, m.currency)
                    : m?.price,
                  startTime: m?.startTime,
                  endTime: m?.endTime,
                  maxMintsPerWallet: m?.maxMintsPerWallet,
                };
              })
            )
          : [];
        return {
          ...response,
          mintType: mintStages?.[0]?.price?.amount?.decimal > 0 ? "paid" : "free",
          mintStatus: metadata.mint_status,
          mintStages,
          image: metadata?.metadata?.imageUrl,
          name: metadata?.name,
          volumeChange: {
            "1day": metadata.day1_volume_change,
            "7day": metadata.day7_volume_change,
            "30day": metadata.day30_volume_change,
            allTime: metadata.all_time_volume,
          },
          tokenCount: Number(metadata.token_count || 0),
          ownerCount: Number(metadata.owner_count || 0),
          banner: metadata.metadata?.bannerImageUrl,
          description: metadata.metadata?.description,
          floorAsk,
        };
      })
  );

  return collections;
}

async function getCollectionsMetadata(collectionsResult: any[], status?: "active" | "inactive") {
  const collectionIds = collectionsResult.map((collection: any) => collection.id);
  const collectionsToFetch = collectionIds.map((id: string) => `collectionCache:v1:${id}`);
  const collectionMetadataCache = await redis
    .mget(collectionsToFetch)
    .then((results) =>
      results.filter((result) => !!result).map((result: any) => JSON.parse(result))
    );

  logger.info(
    "top-selling-collections",
    `using ${collectionMetadataCache.length} collections from cache`
  );

  const collectionsToFetchFromDb = collectionIds.filter((id: string) => {
    return !collectionMetadataCache.find((cache: any) => cache.id === id);
  });

  let collectionMetadataResponse: any = [];
  if (collectionsToFetchFromDb.length > 0) {
    logger.info(
      "top-selling-collections",
      `Fetching ${collectionsToFetchFromDb.length} collections from DB`
    );

    const collectionIdList = collectionsToFetchFromDb.map((id: string) => `'${id}'`).join(", ");

    const mintStatus = status ? (status == "active" ? "open" : "closed") : "";

    const mintStatusQuery = mintStatus && `AND mint_status = '${mintStatus}'`;

    const baseQuery = `
    SELECT
    collections.id,
    collections.name,
    collections.contract,
    collections.creator,
    collections.token_count,
    collections.owner_count,
    collections.day1_volume_change,
    collections.day7_volume_change,
    collections.day30_volume_change,
    collections.all_time_volume,
    json_build_object(
      'imageUrl', collections.metadata ->> 'imageUrl',
      'bannerImageUrl', collections.metadata ->> 'bannerImageUrl',
      'description', collections.metadata ->> 'description'
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
    collections.top_buy_id,
    collections.top_buy_value,
    collections.top_buy_maker,
    collections.top_buy_valid_between,
    collections.top_buy_source_id_int,
    mint_subquery.mint_stages,
    mint_subquery.mint_status
  FROM collections
  INNER JOIN LATERAL (
    SELECT array_agg(
      json_build_object(
        'stage', collection_mints.stage::TEXT,
        'tokenId', collection_mints.token_id::TEXT,
        'kind', collection_mints.kind,
        'currency', '0x' || encode(collection_mints.currency, 'hex'),
        'price', collection_mints.price::TEXT,
        'startTime', EXTRACT(epoch FROM collection_mints.start_time)::INTEGER,
        'endTime', EXTRACT(epoch FROM collection_mints.end_time)::INTEGER,
        'maxMintsPerWallet', collection_mints.max_mints_per_wallet
      )
    ) AS mint_stages,
    MAX(status) AS mint_status
    FROM collection_mints
    WHERE collection_mints.collection_id = collections.id
  ) AS mint_subquery ON true
  WHERE collections.id IN (${collectionIdList}) AND mint_status IS NOT NULL ${mintStatusQuery}
  `;

    collectionMetadataResponse = await redb.manyOrNone(baseQuery);

    const redisMulti = redis.multi();

    for (const metadata of collectionMetadataResponse) {
      redisMulti.set(
        `collectionCache:v1:${metadata.id}:${metadata.mint_status}`,
        JSON.stringify(metadata)
      );
      redisMulti.expire(
        `collectionCache:v1:${metadata.id}:${metadata.mint_status}`,
        REDIS_EXPIRATION
      );
    }
    await redisMulti.exec();
  }

  const collectionsMetadata: Record<string, any> = {};

  [...collectionMetadataResponse, ...collectionMetadataCache].forEach((metadata: any) => {
    collectionsMetadata[metadata.id] = metadata;
  });

  return collectionsMetadata;
}

async function getMintsResult(request: Request) {
  const { limit, status, type } = request.query;
  const statusType = status;
  let mintsResult = [];
  const period = request.query.period === "24h" ? "1d" : request.query.period;
  const cacheKey = `topTrendingMints:v1:${period}:${statusType}`;
  const cachedResults = await redis.get(cacheKey);

  if (cachedResults) {
    mintsResult = JSON.parse(cachedResults).slice(0, limit);
    return mintsResult;
  } else {
    const startTime = getStartTime(period);
    mintsResult = await getTrendingMints({
      startTime,
      type,
    });
  }

  return mintsResult.slice(0, 50);
}
