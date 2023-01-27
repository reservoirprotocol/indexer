/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer } from "@/common/utils";
import { Assets } from "@/utils/assets";
import { JoiAttributeValue } from "@/common/joi";

const version = "v1";

export const getAttributesExploreV1Options: RouteOptions = {
  description: "Get detailed aggregate about attributes in a collection, e.g. trait floors",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 15,
      deprecated: true,
    },
  },
  validate: {
    params: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
    query: Joi.object({
      attributeKey: Joi.string().description(
        "Filter to a particular attribute key, e.g. `Composition`"
      ),
      sortBy: Joi.string().valid("floorAskPrice", "topBidValue").default("floorAskPrice"),
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(5000).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      attributes: Joi.array().items(
        Joi.object({
          key: Joi.string().required(),
          value: JoiAttributeValue,
          tokenCount: Joi.number().required(),
          sampleImages: Joi.array().items(Joi.string().allow("", null)),
          lastBuys: Joi.array().items(
            Joi.object({
              value: Joi.number().unsafe().required(),
              timestamp: Joi.number().required(),
            })
          ),
          lastSells: Joi.array().items(
            Joi.object({
              value: Joi.number().unsafe().required(),
              timestamp: Joi.number().required(),
            })
          ),
          floorAskPrices: Joi.array().items(Joi.number().unsafe()),
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
        })
      ),
    }).label(`getAttributesExplore${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-attributes-explore-${version}-handler`, `Wrong response schema: ${error}`);

      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;
    const params = request.params as any;

    try {
      let baseQuery = `
        SELECT
          "ta"."attribute_id",
          MIN("t"."floor_sell_value") AS "floor_sell_value",
          (
            array_agg(distinct("t"."image"))
          )[1:4] AS "sample_images",
          (
            (array_agg(
              "t"."floor_sell_value" ORDER BY "t"."floor_sell_value"
            )
            FILTER (WHERE "t"."floor_sell_value" IS NOT NULL)
          )::text[])[1:21] AS "floor_sell_values",
          (
            (array_agg(
              json_build_object(
                'value', "t"."last_sell_value"::text,
                'timestamp', "t"."last_sell_timestamp"
              ) ORDER BY "t"."last_sell_timestamp" DESC
            )
            FILTER (WHERE "t"."last_sell_value" IS NOT NULL)
          )::json[])[1:11] AS "last_sells",
          (
            (array_agg(
              json_build_object(
                'value', "t"."last_buy_value"::text,
                'timestamp', "t"."last_buy_timestamp"
              ) ORDER BY "t"."last_buy_timestamp" DESC
            )
            FILTER (WHERE "t"."last_buy_value" IS NOT NULL)
          )::json[])[1:11] AS "last_buys"
        FROM "token_attributes" "ta"
        JOIN "attributes" "a"
          ON "ta"."attribute_id" = "a"."id"
        JOIN "attribute_keys" "ak"
          ON "a"."attribute_key_id" = "ak"."id"
        JOIN "tokens" "t"
          ON "ta"."contract" = "t"."contract"
          AND "ta"."token_id" = "t"."token_id"
      `;

      // Filters
      const conditions: string[] = [
        `"ak"."collection_id" = $/collection/`,
        `"ak"."rank" IS NOT NULL`,
      ];
      if (query.attributeKey) {
        conditions.push(`"ak"."key" = $/attributeKey/`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Grouping
      baseQuery += ` GROUP BY "ta"."attribute_id"`;

      baseQuery = `
        WITH "x" AS (${baseQuery})
        SELECT
          "x".*,
          "y".*,
          "ak"."key",
          "a"."value",
          "a"."token_count"
        FROM "x"
        JOIN "attributes" "a"
          ON "x"."attribute_id" = "a"."id"
        JOIN "attribute_keys" "ak"
          ON "a"."attribute_key_id" = "ak"."id"
        LEFT JOIN LATERAL (
          SELECT
            "ts"."top_buy_id",
            "ts"."top_buy_value",
            "ts"."top_buy_maker",
            date_part('epoch', lower("o"."valid_between")) AS "top_buy_valid_from",
            coalesce(
              nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'),
              0
            ) AS "top_buy_valid_until"
          FROM "token_sets" "ts"
          LEFT JOIN "orders" "o"
            ON "ts"."top_buy_id" = "o"."id"
          WHERE "ts"."attribute_id" = "a"."id"
          ORDER BY "ts"."top_buy_value" DESC NULLS LAST
          LIMIT 1
        ) "y" ON TRUE
      `;

      // Sorting
      switch (query.sortBy) {
        case "floorAskPrice": {
          baseQuery += ` ORDER BY "x"."floor_sell_value" DESC NULLS LAST`;
          break;
        }

        case "topBuyValue":
        default: {
          baseQuery += ` ORDER BY "y"."top_buy_value" DESC NULLS LAST`;
          break;
        }
      }

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      const result = await redb.manyOrNone(baseQuery, { ...query, ...params }).then((result) =>
        result.map((r) => ({
          key: r.key,
          value: r.value,
          tokenCount: Number(r.token_count),
          sampleImages: Assets.getLocalAssetsLink(r.sample_images) || [],
          lastBuys: (r.last_buys || []).map(({ value, timestamp }: any) => ({
            value: formatEth(value),
            timestamp: Number(timestamp),
          })),
          lastSells: (r.last_sells || []).map(({ value, timestamp }: any) => ({
            value: formatEth(value),
            timestamp: Number(timestamp),
          })),
          floorAskPrices: (r.floor_sell_values || []).map(formatEth),
          topBid: {
            id: r.top_buy_id,
            value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
            maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
            validFrom: r.top_buy_valid_from,
            validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
          },
        }))
      );

      return { attributes: result };
    } catch (error) {
      logger.error(`get-attributes-explore-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
