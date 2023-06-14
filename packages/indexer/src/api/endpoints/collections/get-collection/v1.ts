/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer } from "@/common/utils";

const version = "v1";

export const getCollectionV1Options: RouteOptions = {
  description: "Get detailed information about a single collection",
  notes: "Get detailed information about a single collection, including real-time stats.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      id: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      slug: Joi.string().description("Filter to a particular slug, e.g. `boredapeyachtclub`"),
    })
      .or("id", "slug")
      .oxor("id", "slug"),
  },
  response: {
    schema: Joi.object({
      collection: Joi.object({
        id: Joi.string(),
        slug: Joi.string().allow("", null),
        name: Joi.string().allow("", null),
        metadata: Joi.object().allow(null),
        sampleImages: Joi.array().items(Joi.string().allow("", null)),
        tokenCount: Joi.string(),
        onSaleCount: Joi.string(),
        primaryContract: Joi.string()
          .lowercase()
          .pattern(/^0x[a-fA-F0-9]{40}$/),
        tokenSetId: Joi.string().allow(null),
        royalties: Joi.object({
          recipient: Joi.string().allow("", null),
          bps: Joi.number(),
        }),
        lastBuy: {
          value: Joi.number().unsafe().allow(null),
          timestamp: Joi.number().allow(null),
        },
        lastSell: {
          value: Joi.number().unsafe().allow(null),
          timestamp: Joi.number().allow(null),
        },
        floorAsk: {
          id: Joi.string().allow(null),
          price: Joi.number().unsafe().allow(null),
          maker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/)
            .allow(null),
          validFrom: Joi.number().unsafe().allow(null),
          validUntil: Joi.number().unsafe().allow(null),
          token: Joi.object({
            contract: Joi.string()
              .lowercase()
              .pattern(/^0x[a-fA-F0-9]{40}$/)
              .allow(null),
            tokenId: Joi.string()
              .pattern(/^[0-9]+$/)
              .allow(null),
            name: Joi.string().allow(null),
            image: Joi.string().allow("", null),
          }).allow(null),
        },
        topBid: Joi.object({
          id: Joi.string().allow(null),
          value: Joi.number().unsafe().allow(null),
          maker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/)
            .allow(null),
          validFrom: Joi.number().unsafe().allow(null),
          validUntil: Joi.number().unsafe().allow(null),
        }),
        rank: Joi.object({
          "1day": Joi.number().unsafe().allow(null),
          "7day": Joi.number().unsafe().allow(null),
          "30day": Joi.number().unsafe().allow(null),
          allTime: Joi.number().unsafe().allow(null),
        }),
        volume: Joi.object({
          "1day": Joi.number().unsafe().allow(null),
          "7day": Joi.number().unsafe().allow(null),
          "30day": Joi.number().unsafe().allow(null),
          allTime: Joi.number().unsafe().allow(null),
        }),
        volumeChange: {
          "1day": Joi.number().unsafe().allow(null),
          "7day": Joi.number().unsafe().allow(null),
          "30day": Joi.number().unsafe().allow(null),
        },
        floorSale: {
          "1day": Joi.number().unsafe().allow(null),
          "7day": Joi.number().unsafe().allow(null),
          "30day": Joi.number().unsafe().allow(null),
        },
        floorSaleChange: {
          "1day": Joi.number().unsafe().allow(null),
          "7day": Joi.number().unsafe().allow(null),
          "30day": Joi.number().unsafe().allow(null),
        },
      }).allow(null),
    }).label(`getCollection${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-collection-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          "c"."id",
          "c"."slug",
          "c"."name",
          "c"."metadata",
          "c"."royalties",
          "c"."contract",
          "c"."token_set_id",
          "c"."day1_rank",
          "c"."day1_volume",
          "c"."day7_rank",
          "c"."day7_volume",
          "c"."day30_rank",
          "c"."day30_volume",
          "c"."all_time_rank",
          "c"."all_time_volume",
          "c"."day1_volume_change",
          "c"."day7_volume_change",
          "c"."day30_volume_change",
          "c"."day1_floor_sell_value",
          "c"."day7_floor_sell_value",
          "c"."day30_floor_sell_value",               
          "c"."token_count",
          (
            SELECT COUNT(*) FROM "tokens" "t"
            WHERE "t"."collection_id" = "c"."id"
              AND "t"."floor_sell_value" IS NOT NULL
          ) AS "on_sale_count",
          ARRAY(
            SELECT "t"."image" FROM "tokens" "t"
            WHERE "t"."collection_id" = "c"."id"
            LIMIT 4
          ) AS "sample_images"          
        FROM "collections" "c"
      `;

      if (query.id) {
        baseQuery += ` WHERE "c"."id" = $/id/`;
      } else if (query.slug) {
        baseQuery += ` WHERE "c"."slug" = $/slug/`;
      }

      // Sorting
      baseQuery += ` ORDER BY "c"."all_time_volume" DESC`;

      baseQuery += ` LIMIT 1`;

      baseQuery = `
        WITH "x" AS (${baseQuery})
        SELECT
          "x".*,
          "y".*,
          "z".*
        FROM "x"
        LEFT JOIN LATERAL (
          SELECT
            "t"."contract" AS "floor_sell_token_contract",
            "t"."token_id" AS "floor_sell_token_id",
            "t"."name" AS "floor_sell_token_name",
            "t"."image" AS "floor_sell_token_image",
            "t"."floor_sell_id",
            "t"."floor_sell_value",
            "t"."floor_sell_maker",
            DATE_PART('epoch', LOWER("o"."valid_between")) AS "floor_sell_valid_from",
              COALESCE(
                NULLIF(DATE_PART('epoch', UPPER("o"."valid_between")), 'Infinity'),
                0
              ) AS "floor_sell_valid_until",
            "t"."last_sell_value",
            "t"."last_sell_timestamp"
          FROM "tokens" "t"
          LEFT JOIN "orders" "o"
            ON "t"."floor_sell_id" = "o"."id"
          WHERE "t"."collection_id" = "x"."id"
          ORDER BY "t"."floor_sell_value"
          LIMIT 1
        ) "y" ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            "ts"."top_buy_id",
            "ts"."top_buy_value",
            "ts"."top_buy_maker",
            DATE_PART('epoch', LOWER("o"."valid_between")) AS "top_buy_valid_from",
            COALESCE(
              NULLIF(DATE_PART('epoch', UPPER("o"."valid_between")), 'Infinity'),
              0
            ) AS "top_buy_valid_until",
            "ts"."last_buy_value",
            "ts"."last_buy_timestamp"
          FROM "token_sets" "ts"
          LEFT JOIN "orders" "o"
            ON "ts"."top_buy_id" = "o"."id"
          WHERE "ts"."collection_id" = "x"."id"
          ORDER BY "ts"."top_buy_value" DESC NULLS LAST
          LIMIT 1
        ) "z" ON TRUE
      `;

      const result = await redb.oneOrNone(baseQuery, query).then((r) =>
        !r
          ? null
          : {
              id: r.id,
              slug: r.slug,
              name: r.name,
              metadata: {
                ...r.metadata,
                imageUrl:
                  r.metadata?.imageUrl || (r.sample_images?.length ? r.sample_images[0] : null),
              },
              sampleImages: r.sample_images || [],
              tokenCount: String(r.token_count),
              onSaleCount: String(r.on_sale_count),
              primaryContract: fromBuffer(r.contract),
              tokenSetId: r.token_set_id,
              royalties: r.royalties ? r.royalties[0] : null,
              lastBuy: {
                value: r.last_buy_value ? formatEth(r.last_buy_value) : null,
                timestamp: r.last_buy_timestamp,
              },
              lastSell: {
                value: r.last_sell_value ? formatEth(r.last_sell_value) : null,
                timestamp: r.last_sell_timestamp,
              },
              floorAsk: {
                id: r.floor_sell_id,
                price: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
                maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
                validFrom: r.floor_sell_valid_from,
                validUntil: r.floor_sell_value ? r.floor_sell_valid_until : null,
                token: r.floor_sell_value && {
                  contract: r.floor_sell_token_contract
                    ? fromBuffer(r.floor_sell_token_contract)
                    : null,
                  tokenId: r.floor_sell_token_id,
                  name: r.floor_sell_token_name,
                  image: r.floor_sell_token_image,
                },
              },
              topBid: {
                id: r.top_buy_id,
                value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
                maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
                validFrom: r.top_buy_valid_from,
                validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
              },
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
              floorSaleChange: {
                "1day": Number(r.day1_floor_sell_value)
                  ? Number(r.floor_sell_value) / Number(r.day1_floor_sell_value)
                  : null,
                "7day": Number(r.day7_floor_sell_value)
                  ? Number(r.floor_sell_value) / Number(r.day7_floor_sell_value)
                  : null,
                "30day": Number(r.day30_floor_sell_value)
                  ? Number(r.floor_sell_value) / Number(r.day30_floor_sell_value)
                  : null,
              },
            }
      );

      return { collection: result };
    } catch (error) {
      logger.error(`get-collection-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
