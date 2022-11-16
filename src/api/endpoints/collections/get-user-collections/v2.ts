/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { CollectionSets } from "@/models/collection-sets";
import { Assets } from "@/utils/assets";
import { Sources } from "@/models/sources";

const version = "v2";

export const getUserCollectionsV2Options: RouteOptions = {
  description: "User collections",
  notes:
    "Get aggregate stats for a user, grouped by collection. Useful for showing total portfolio information.",
  tags: ["api", "Collections"],
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required()
        .description(
          "Filter to a particular user. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
    }),
    query: Joi.object({
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community. Example: `artblocks`"),
      collectionsSetId: Joi.string()
        .lowercase()
        .description("Filter to a particular collection set."),
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      includeTopBid: Joi.boolean()
        .default(false)
        .description("If true, top bid will be returned in the response."),
      includeLiquidCount: Joi.boolean()
        .default(false)
        .description("If true, number of tokens with bids will be returned in the response."),
      offset: Joi.number()
        .integer()
        .min(0)
        .max(10000)
        .default(0)
        .description("Use offset to request the next batch of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(20)
        .description("Amount of items returned in response."),
    }),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          collection: Joi.object({
            id: Joi.string(),
            slug: Joi.string().allow(null, ""),
            name: Joi.string().allow(null, ""),
            image: Joi.string().allow(null, ""),
            banner: Joi.string().allow(null, ""),
            discordUrl: Joi.string().allow(null, ""),
            externalUrl: Joi.string().allow(null, ""),
            twitterUsername: Joi.string().allow(null, ""),
            description: Joi.string().allow(null, ""),
            sampleImages: Joi.array().items(Joi.string().allow(null, "")),
            tokenCount: Joi.string(),
            tokenSetId: Joi.string().allow(null),
            primaryContract: Joi.string()
              .lowercase()
              .pattern(/^0x[a-fA-F0-9]{40}$/),
            floorAskPrice: Joi.string().allow(null),
            topBidValue: Joi.string().allow(null),
            topBidMaker: Joi.string()
              .lowercase()
              .pattern(/^0x[a-fA-F0-9]{40}$/)
              .allow(null),
            topBidSourceDomain: Joi.string().allow(null, ""),
            rank: Joi.object({
              "1day": Joi.string().allow(null),
              "7day": Joi.string().allow(null),
              "30day": Joi.string().allow(null),
              allTime: Joi.string().allow(null),
            }),
            volume: Joi.object({
              "1day": Joi.string().allow(null),
              "7day": Joi.string().allow(null),
              "30day": Joi.string().allow(null),
              allTime: Joi.string().allow(null),
            }),
            volumeChange: {
              "1day": Joi.string().allow(null),
              "7day": Joi.string().allow(null),
              "30day": Joi.string().allow(null),
            },
            floorSale: {
              "1day": Joi.string().allow(null),
              "7day": Joi.string().allow(null),
              "30day": Joi.string().allow(null),
            },
          }),
          ownership: Joi.object({
            tokenCount: Joi.string(),
            onSaleCount: Joi.string(),
            liquidCount: Joi.string().optional(),
          }),
        })
      ),
    }).label(`getUserCollections${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-user-collections-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    let liquidCount = "";
    let selectLiquidCount = "";
    if (query.includeLiquidCount) {
      selectLiquidCount = "SUM(owner_liquid_count) AS owner_liquid_count,";
      liquidCount = `
        LEFT JOIN LATERAL (
            SELECT 1 AS owner_liquid_count
            FROM "orders" "o"
            JOIN "token_sets_tokens" "tst" ON "o"."token_set_id" = "tst"."token_set_id"
            WHERE "tst"."contract" = nft_balances."contract"
            AND "tst"."token_id" = nft_balances."token_id"
            AND "o"."side" = 'buy'
            AND "o"."fillability_status" = 'fillable'
            AND "o"."approval_status" = 'approved'
            AND EXISTS(
              SELECT FROM "nft_balances" "nb"
                WHERE "nb"."contract" = nft_balances."contract"
                AND "nb"."token_id" = nft_balances."token_id"
                AND "nb"."amount" > 0
                AND "nb"."owner" != "o"."maker"
            )
            LIMIT 1
        ) "y" ON TRUE
      `;
    }

    try {
      let baseQuery = `
        SELECT  collections.id,
                collections.slug,
                collections.name,
                (collections.metadata ->> 'imageUrl')::TEXT AS "image",
                (collections.metadata ->> 'bannerImageUrl')::TEXT AS "banner",
                (collections.metadata ->> 'discordUrl')::TEXT AS "discord_url",
                (collections.metadata ->> 'description')::TEXT AS "description",
                (collections.metadata ->> 'externalUrl')::TEXT AS "external_url",
                (collections.metadata ->> 'twitterUsername')::TEXT AS "twitter_username",
                collections.contract,
                collections.token_set_id,
                collections.token_count,
                (
                  SELECT array(
                    SELECT tokens.image FROM tokens
                    WHERE tokens.collection_id = collections.id
                    AND tokens.image IS NOT NULL
                    LIMIT 4
                  )
                ) AS sample_images,
                collections.day1_volume,
                collections.day7_volume,
                collections.day30_volume,
                collections.all_time_volume,
                collections.day1_rank,
                collections.day7_rank,
                collections.day30_rank,
                collections.all_time_rank,
                collections.day1_volume_change,
                collections.day7_volume_change,
                collections.day30_volume_change,
                collections.floor_sell_value,
                collections.day1_floor_sell_value,
                collections.day7_floor_sell_value,
                collections.day30_floor_sell_value,
                SUM(COALESCE(nft_balances.amount, 0)) AS owner_token_count,
                ${selectLiquidCount}
                SUM(CASE WHEN tokens.floor_sell_value IS NULL THEN 0 ELSE 1 END) AS owner_on_sale_count
        FROM nft_balances 
        JOIN tokens ON nft_balances.contract = tokens.contract AND nft_balances.token_id = tokens.token_id
        ${liquidCount}
        JOIN collections ON tokens.collection_id = collections.id
      `;

      // Filters
      (params as any).user = toBuffer(params.user);
      const conditions: string[] = [`nft_balances.owner = $/user/`, `nft_balances.amount > 0`];

      if (query.community) {
        conditions.push(`collections.community = $/community/`);
      }

      if (query.collectionsSetId) {
        const collectionsIds = await CollectionSets.getCollectionsIds(query.collectionsSetId);

        if (!_.isEmpty(collectionsIds)) {
          query.collectionsIds = _.join(collectionsIds, "','");
          conditions.push(`collections.id IN ('$/collectionsIds:raw/')`);
        }
      }

      if (query.collection) {
        conditions.push(`collections.id = $/collection/`);
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Grouping
      baseQuery += ` GROUP BY collections.id, nft_balances.owner`;

      // Sorting
      baseQuery += ` ORDER BY collections.all_time_volume DESC`;

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      let topBidQuery = "";
      if (query.includeTopBid) {
        topBidQuery = `LEFT JOIN LATERAL (
          SELECT
            token_sets.top_buy_value,
            token_sets.top_buy_maker
          FROM token_sets
          WHERE token_sets.id = x.token_set_id
          ORDER BY token_sets.top_buy_value DESC
          LIMIT 1
        ) y ON TRUE`;

        topBidQuery = `LEFT JOIN LATERAL (
          SELECT
            ts.top_buy_id,
            ts.top_buy_value,
            o.source_id_int AS top_buy_source_id_int,
            ts.top_buy_maker
          FROM token_sets ts
          LEFT JOIN orders o ON ts.top_buy_id = o.id
          WHERE ts.id = x.token_set_id
          ORDER BY ts.top_buy_value DESC NULLS LAST
          LIMIT 1
        ) y ON TRUE`;
      }

      baseQuery = `
        WITH x AS (${baseQuery})
        SELECT *
        FROM x
        ${topBidQuery}
      `;

      const result = await redb.manyOrNone(baseQuery, { ...params, ...query });

      const sources = await Sources.getInstance();

      const collections = _.map(result, (r) => {
        const response = {
          collection: {
            id: r.id,
            slug: r.slug,
            name: r.name,
            image:
              Assets.getLocalAssetsLink(r.image) ||
              (r.sample_images?.length ? Assets.getLocalAssetsLink(r.sample_images[0]) : null),
            banner: r.banner,
            discordUrl: r.discord_url,
            externalUrl: r.external_url,
            twitterUsername: r.twitter_username,
            description: r.description,
            sampleImages: Assets.getLocalAssetsLink(r.sample_images) || [],
            tokenCount: String(r.token_count),
            primaryContract: fromBuffer(r.contract),
            tokenSetId: r.token_set_id,
            floorAskPrice: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
            rank: {
              "1day": r.day1_rank,
              "7day": r.day7_rank,
              "30day": r.day30_rank,
              allTime: r.all_time_rank,
            },
            volume: {
              "1day": r.day1_volume ? formatEth(r.day1_volume) : null,
              "7day": r.day7_volume ? formatEth(r.day7_volume) : null,
              "30day": r.day30_volume ? formatEth(r.day30_volume) : null,
              allTime: r.all_time_volume ? formatEth(r.all_time_volume) : null,
            },
            volumeChange: {
              "1day": r.day1_volume_change,
              "7day": r.day7_volume_change,
              "30day": r.day30_volume_change,
            },
            floorSale: {
              "1day": r.day1_floor_sell_value ? formatEth(r.day1_floor_sell_value) : null,
              "7day": r.day7_floor_sell_value ? formatEth(r.day7_floor_sell_value) : null,
              "30day": r.day30_floor_sell_value ? formatEth(r.day30_floor_sell_value) : null,
            },
          },
          ownership: {
            tokenCount: String(r.owner_token_count),
            onSaleCount: String(r.owner_on_sale_count),
            liquidCount: query.includeLiquidCount
              ? String(Number(r.owner_liquid_count))
              : undefined,
          },
        };

        if (query.includeTopBid) {
          (response as any).collection.topBidValue = r.top_buy_value
            ? formatEth(r.top_buy_value)
            : null;

          (response as any).collection.topBidMaker = r.top_buy_maker
            ? fromBuffer(r.top_buy_maker)
            : null;

          (response as any).collection.topBidSourceDomain = r.top_buy_source_id_int
            ? sources.get(r.top_buy_source_id_int)?.domain
            : null;
        }

        return response;
      });

      return { collections };
    } catch (error) {
      logger.error(`get-user-collections-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
