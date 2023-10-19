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
const REDIS_EXPIRATION_MINTS = 120; // Assuming an hour, adjust as needed.

import { getTrendingMintsV2 } from "@/elasticsearch/indexes/activities";

import { getJoiPriceObject, JoiPrice } from "@/common/joi";
import { Sources } from "@/models/sources";

const version = "v1";
export interface MintResult {
  contract: Buffer;
  takers: Buffer[];
}
export interface Mint {
  collection_id: string;
  kind: string;
  status: string;
  mint_stages: {
    stage: string;
    tokenId: number;
    kind: string;
    currency: string;
    price: string;
    startTime: null;
    endTime: null;
    maxMintsPerWallet: number;
  }[];
  details: {
    tx: {
      to: string;
      data: {
        params: {
          kind: string;
          abiType: string;
        }[];
        signature: string;
      };
    };
  };
  currency: {
    type: string;
    data: number[];
  };
  price: string;
  stage: string;
  max_mints_per_wallet: any;
  start_time: any;
  end_time: any;
  created_at: string;
  updated_at: string;
  max_supply: string;
  token_id: any;
  allowlist_id: any;
  id: string;
}

export interface Metadata {
  id: string;
  name: string;
  contract: {
    type: string;
    data: number[];
  };
  creator: any;
  token_count: number;
  owner_count: number;
  day1_volume_change: any;
  day7_volume_change: any;
  day30_volume_change: any;
  all_time_volume: string;
  metadata: {
    imageUrl: any;
    bannerImageUrl: any;
    description: any;
  };
  non_flagged_floor_sell_id: string;
  non_flagged_floor_sell_value: string;
  non_flagged_floor_sell_maker: {
    type: string;
    data: number[];
  };
  non_flagged_floor_sell_valid_between: string;
  non_flagged_floor_sell_source_id_int: number;
  floor_sell_id: string;
  floor_sell_value: string;
  floor_sell_maker: {
    type: string;
    data: number[];
  };
  floor_sell_valid_between: string;
  floor_sell_source_id_int: number;
  normalized_floor_sell_id: string;
  normalized_floor_sell_value: string;
  normalized_floor_sell_maker: {
    type: string;
    data: number[];
  };
  normalized_floor_sell_valid_between: string;
  normalized_floor_sell_source_id_int: number;
  top_buy_id: any;
  top_buy_value: any;
  top_buy_maker: any;
  top_buy_valid_between: any;
  top_buy_source_id_int: any;
}

export interface ElasticMintResult {
  volume: number;
  count: number;
  id: string;
}

export type MetadataKey = keyof Metadata;

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
          mintPrice: Joi.number().allow(null),
          mintVolume: Joi.any(),
          mintCount: Joi.number().allow(null),
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
          addresses: Joi.array().items(Joi.string()),
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
    }).label(`get-trending-mints${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-trending-mints-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async ({ query }: Request, h) => {
    const { normalizeRoyalties, useNonFlaggedFloorAsk, limit, type, period } = query;

    try {
      const mintingCollections = await getMintingCollections(type, period, limit);

      const contractIds = mintingCollections.map(({ collection_id }) => collection_id);

      const elasticMintData = await getElasticMints(contractIds, getStartTime(period));

      const collectionsMetadata = await getCollectionsMetadata(contractIds);

      const mints = await formatCollections(
        mintingCollections,
        elasticMintData,
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

async function getElasticMints(
  contracts: string[],
  startTime: number
): Promise<ElasticMintResult[]> {
  return getTrendingMintsV2({ contracts, startTime });
}

async function getMintingCollections(
  type: "paid" | "free" | "any",
  period: "5m" | "10m" | "30m" | "1h" | "2h" | "6h" | "24h" | "1d",
  limit: number
): Promise<Mint[]> {
  const cacheKey = `minting-collections:v1:${type}:${period}`;

  const cachedString: string | null = await redis.get(cacheKey);
  const cachedResults: Mint[] = cachedString ? JSON.parse(cachedString) : [];

  let resultsFromDB: Mint[] = [];

  if (cachedResults.length < limit) {
    const dbLimit = limit - cachedResults.length;

    const conditions: string[] = [];

    conditions.push(`status = 'open'`);

    if (type && type !== "any") {
      conditions.push(`price ${type === "free" ? "= 0" : "> 0"}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause = `LIMIT ${dbLimit}`;
    const offsetClause = `OFFSET ${cachedResults.length}`;

    const baseQuery = `
    WITH y AS (
      SELECT 
        collection_id,
        array_agg(
          json_build_object(
            'stage', stage,
            'tokenId', token_id::TEXT,
            'kind', kind,
            'currency', concat('0x', encode(currency, 'hex')),
            'price', price::TEXT,
            'startTime', floor(extract(epoch from start_time)),
            'endTime', floor(extract(epoch from end_time)),
            'maxMintsPerWallet', max_mints_per_wallet
          )
        ) AS mint_stages
      FROM collection_mints 
      ${whereClause} 
      GROUP BY collection_id
    )
  
    SELECT x.*, m.mint_stages 
    FROM collection_mints AS x 
    INNER JOIN y AS m ON x.collection_id = m.collection_id
    ${whereClause}
    ORDER BY x.created_at DESC
    ${limitClause}
    ${offsetClause}
  `;

    resultsFromDB = await redb.manyOrNone<Mint>(baseQuery);
  }

  const combinedResults = cachedResults.concat(resultsFromDB);

  if (resultsFromDB.length > 0) {
    await redis.set(cacheKey, JSON.stringify(combinedResults));
    await redis.expire(cacheKey, REDIS_EXPIRATION_MINTS);
  }

  return combinedResults.slice(0, limit);
}

async function formatCollections(
  mintingCollections: Mint[],
  collectionsResult: ElasticMintResult[],
  collectionsMetadata: Record<string, Metadata>,
  normalizeRoyalties: boolean,
  useNonFlaggedFloorAsk: boolean
): Promise<any[]> {
  const sources = await Sources.getInstance();
  const recentMints = await getRecentMints(collectionsResult.map((c) => c.id));

  const collections = await Promise.all(
    collectionsResult.map(async (r) => {
      const mintData = mintingCollections.find((c) => c.collection_id == r.id);
      const metadata = collectionsMetadata[r.id];
      let floorAsk;
      let prefix = "";

      if (normalizeRoyalties) {
        prefix = "normalized_";
      } else if (useNonFlaggedFloorAsk) {
        prefix = "non_flagged_";
      }

      const floorAskId = metadata[(prefix + "floor_sell_id") as MetadataKey];
      const floorAskValue = metadata[(prefix + "floor_sell_value") as MetadataKey];
      let floorAskCurrency = metadata[(prefix + "floor_sell_currency") as MetadataKey];
      const floorAskSource = metadata[(prefix + "floor_sell_source_id_int") as MetadataKey];
      const floorAskCurrencyValue =
        metadata[(prefix + `${prefix}floor_sell_currency_value`) as MetadataKey];

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

      return {
        id: r.id,
        banner: metadata.metadata.bannerImageUrl,
        description: metadata.metadata.description,
        image: metadata?.metadata?.imageUrl,
        name: metadata?.name,
        mintType: Number(mintData?.price) > 0 ? "paid" : "free",
        mintCount: r.count,
        mintVolume: r.volume,
        mintStages: mintData?.mint_stages
          ? await Promise.all(
              mintData.mint_stages.map(async (m: any) => {
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
          : [],
        addresses: recentMints[r.id] ? recentMints[r.id] : [],
        volumeChange: {
          "1day": metadata.day1_volume_change,
          "7day": metadata.day7_volume_change,
          "30day": metadata.day30_volume_change,
          allTime: metadata.all_time_volume,
        },
        tokenCount: Number(metadata.token_count || 0),
        ownerCount: Number(metadata.owner_count || 0),
        floorAsk,
      };
    })
  );

  return collections;
}

async function getCollectionsMetadata(collectionIds: string[]): Promise<Record<string, Metadata>> {
  const collectionsToFetch = collectionIds.map((id: string) => `collection-cache:v1:${id}`);
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
      collections.top_buy_id,
      collections.top_buy_value,
      collections.top_buy_maker,
      collections.top_buy_valid_between,
      collections.top_buy_source_id_int
    FROM collections
    WHERE collections.id IN (${collectionIdList})
  `;

    collectionMetadataResponse = await redb.manyOrNone(baseQuery);

    const redisMulti = redis.multi();

    for (const metadata of collectionMetadataResponse) {
      redisMulti.set(
        `collection-cache:v1:${metadata.id}:${metadata.mint_status}`,
        JSON.stringify(metadata)
      );
      redisMulti.expire(
        `collection-cache:v1:${metadata.id}:${metadata.mint_status}`,
        REDIS_EXPIRATION
      );
    }
    await redisMulti.exec();
  }

  const collectionsMetadata: Record<string, Metadata> = {};

  [...collectionMetadataResponse, ...collectionMetadataCache].forEach((metadata: any) => {
    collectionsMetadata[metadata.id] = metadata;
  });

  return collectionsMetadata;
}

async function getRecentMints(collectionIds: string[]): Promise<Record<string, string[]>> {
  const idsList = collectionIds.map((id) => `'${id.replace("0x", "\\x")}'`).join(",");

  const results: MintResult[] = await redb.manyOrNone(`
    WITH LimitedTakers AS (
      SELECT contract, taker, created_at
      FROM fill_events_2
      WHERE order_kind = 'mint' AND contract IN (${idsList})
      ORDER BY created_at DESC
      LIMIT 50
    )

    SELECT contract, ARRAY_AGG(taker) AS takers
    FROM LimitedTakers
    GROUP BY contract;
  `);

  const hashMap: Record<string, string[]> = {};
  for (const result of results) {
    hashMap[fromBuffer(result.contract)] = result.takers.map((taker) => fromBuffer(taker));
  }
  return hashMap;
}
