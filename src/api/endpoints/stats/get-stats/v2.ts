/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiPrice, getJoiPriceObject } from "@/common/joi";
import { fromBuffer, getNetAmount, regex, toBuffer } from "@/common/utils";
import { Tokens } from "@/models/tokens";
import { Assets } from "@/utils/assets";

const version = "v2";

export const getStatsV2Options: RouteOptions = {
  description: "Stats",
  notes: "Get aggregate stats for a particular set (collection, attribute or single token)",
  tags: ["api", "Stats"],
  plugins: {
    "hapi-swagger": {
      order: 7,
    },
  },
  validate: {
    query: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      attributes: Joi.object()
        .unknown()
        .description("Filter to a particular attribute. Example: `attributes[Type]=Original`"),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
    })
      .oxor("collection", "token")
      .or("collection", "token"),
  },
  response: {
    schema: Joi.object({
      stats: Joi.object({
        tokenCount: Joi.number().required(),
        onSaleCount: Joi.number().required(),
        flaggedTokenCount: Joi.number().required(),
        sampleImages: Joi.array().items(Joi.string().allow("", null)),
        market: Joi.object({
          floorAsk: Joi.object({
            id: Joi.string().allow(null),
            price: JoiPrice.allow(null),
            maker: Joi.string().lowercase().pattern(regex.address).allow(null),
            validFrom: Joi.string().allow(null),
            validUntil: Joi.string().allow(null),
            token: Joi.object({
              contract: Joi.string().lowercase().pattern(regex.address).allow(null),
              tokenId: Joi.string().lowercase().pattern(regex.number).allow(null),
              name: Joi.string().allow("", null),
              image: Joi.string().allow("", null),
            }),
          }),
          topBid: {
            id: Joi.string().allow(null),
            price: JoiPrice.allow(null),
            maker: Joi.string().lowercase().pattern(regex.address).allow(null),
            validFrom: Joi.string().allow(null),
            validUntil: Joi.string().allow(null),
          },
        }),
      }).allow(null),
    }).label(`getStats${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-stats-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery: string | undefined;

      if (query.token) {
        const [contract, tokenId] = query.token.split(":");
        (query as any).contract = toBuffer(contract);
        (query as any).tokenId = tokenId;

        (query as any).topBidOrderId = null;
        const topBid = await Tokens.getTokensTopBid(contract, [tokenId]);
        if (!_.isEmpty(topBid)) {
          (query as any).topBidOrderId = topBid[0].orderId;
        }

        baseQuery = `
          SELECT
            1 AS "token_count",
            (
              CASE WHEN "t"."floor_sell_value" IS NOT NULL
                THEN 1
                ELSE 0
              END
            ) AS "on_sale_count",
            (
              CASE WHEN "t"."is_flagged" = 1
                THEN 1
                ELSE 0
              END
            ) AS "flagged_token_count",
            array["t"."image"] AS "sample_images",
            "t"."floor_sell_id",
            "t"."floor_sell_value",
            "t"."floor_sell_maker",
            date_part('epoch', lower("os"."valid_between")) AS "floor_sell_valid_from",
            coalesce(
              nullif(date_part('epoch', upper("os"."valid_between")), 'Infinity'),
              0
            ) AS "floor_sell_valid_until",
            os.currency AS floor_sell_currency,
            coalesce(os.currency_value, os.value) AS floor_sell_currency_value,
            os.fee_bps AS floor_sell_fee_bps,
            "t"."contract",
            "t"."token_id",
            "t"."name",
            "t"."image",
            "ob"."id" AS "top_buy_id",
            "ob".normalized_value AS top_buy_normalized_value,
            "ob".currency_normalized_value AS top_buy_currency_normalized_value,
            "ob"."value" AS "top_buy_value",
            "ob"."maker" AS "top_buy_maker",
            date_part('epoch', lower("ob"."valid_between")) AS "top_buy_valid_from",
            coalesce(
              nullif(date_part('epoch', upper("ob"."valid_between")), 'Infinity'),
              0
            ) AS "top_buy_valid_until",
            ob.price AS top_buy_price,
            ob.currency AS top_buy_currency,
            ob.currency_price AS top_buy_currency_price,
            ob.currency_value AS top_buy_currency_value,
            os.normalized_value AS floor_sell_normalized_value,
            os.currency_normalized_value AS floor_sell_currency_normalized_value
          FROM "tokens" "t"
          LEFT JOIN "orders" "os"
            ON "t"."floor_sell_id" = "os"."id"
          LEFT JOIN "orders" "ob"
            ON $/topBidOrderId/ = "ob"."id"
          WHERE "t"."contract" = $/contract/
            AND "t"."token_id" = $/tokenId/
        `;
      } else if (query.collection && query.attributes) {
        const attributes: { key: string; value: string }[] = [];
        Object.entries(query.attributes).forEach(([key, values]) => {
          (Array.isArray(values) ? values : [values]).forEach((value) =>
            attributes.push({ key, value })
          );
        });

        const conditions: string[] = [`"t"."collection_id" = $/collection/`];
        for (let i = 0; i < attributes.length; i++) {
          (query as any)[`key${i}`] = attributes[i].key;
          (query as any)[`value${i}`] = attributes[i].value;
          conditions.push(`
            EXISTS (
              SELECT FROM "token_attributes" "ta"
              JOIN "attributes" "a"
                ON "ta"."attribute_id" = "a"."id"
              JOIN "attribute_keys" "ak"
                ON "a"."attribute_key_id" = "ak"."id"
              WHERE "ta"."contract" = "t"."contract"
                AND "ta"."token_id" = "t"."token_id"
                AND "ak"."key" = $/key${i}/
                AND "a"."value" = $/value${i}/
            )
          `);
        }

        // Filter out all tokens that match the specified attributes.
        let filterQuery = `
          SELECT
            "t"."contract",
            "t"."token_id",
            "t"."name",
            "t"."image",
            "t"."floor_sell_id",
            "t"."floor_sell_value",
            "t"."floor_sell_maker",
            "t"."is_flagged"
          FROM "tokens" "t"
        `;
        if (conditions.length) {
          filterQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
        }

        const sellQuery = `
          SELECT
            "x"."contract",
            "x"."token_id",
            "x"."name",
            "x"."image",
            "x"."floor_sell_id",
            "x"."floor_sell_value",
            "x"."floor_sell_maker",
            date_part('epoch', lower("os"."valid_between")) AS "floor_sell_valid_from",
            coalesce(
              nullif(date_part('epoch', upper("os"."valid_between")), 'Infinity'),
              0
            ) AS "floor_sell_valid_until",
            os.currency AS floor_sell_currency,
            coalesce(os.currency_value, os.value) AS floor_sell_currency_value,
            os.fee_bps AS floor_sell_fee_bps
          FROM "x"
          LEFT JOIN "orders" "os"
            ON "x"."floor_sell_id" = "os"."id"
          ORDER BY "x"."floor_sell_value"
          LIMIT 1
        `;

        let buyQuery: string;
        if (attributes.length === 1) {
          buyQuery = `
            SELECT
              "ts"."top_buy_id",
              "ts"."top_buy_value",
              "ts"."top_buy_maker",
              date_part('epoch', lower("ob"."valid_between")) AS "top_buy_valid_from",
              coalesce(
                nullif(date_part('epoch', upper("ob"."valid_between")), 'Infinity'),
                0
              ) AS "top_buy_valid_until",
              ob.price AS top_buy_price,
              ob.currency AS top_buy_currency,
              coalesce(ob.currency_price, ob.price) AS top_buy_currency_price,
              coalesce(ob.currency_value, ob.value) AS top_buy_currency_value
            FROM "token_sets" "ts"
            LEFT JOIN "orders" "ob"
              ON "ts"."top_buy_id" = "ob"."id"
            WHERE "ts"."attribute_id" = (
                SELECT "a"."id" FROM "attributes" "a"
                JOIN "attribute_keys" "ak"
                  ON "a"."attribute_key_id" = "ak"."id"
                WHERE "ak"."collection_id" = $/collection/
                  AND "ak"."key" = $/key0/
                  AND "a"."value" = $/value0/
                LIMIT 1
              )
              AND "ts"."attribute_id" IS NOT NULL
            ORDER BY "ts"."top_buy_value" DESC NULLS LAST
            LIMIT 1
          `;
        } else {
          // TODO: Update this part when support for orders on multiple
          // attributes is integrated. That would require a refactoring
          // of the `token_sets` table as well.
          buyQuery = `
            SELECT
              NULL AS "top_buy_id",
              NULL AS "top_buy_value",
              NULL AS "top_buy_maker",
              NULL AS "top_buy_valid_from",
              NULL AS "top_buy_valid_to"
          `;
        }

        baseQuery = `
          WITH
            "x" AS (${filterQuery}),
            "y" AS (
              SELECT
                COUNT(*) AS "token_count",
                COUNT(*) FILTER (WHERE "x"."floor_sell_value" IS NOT NULL) AS "on_sale_count",
                COUNT(*) FILTER (WHERE "x"."is_flagged" = 1) AS "flagged_token_count",
                (array_agg("x"."image"))[1:4] AS "sample_images"
              FROM "x"
            )
          SELECT
            "y".*,
            "z".*,
            "w".*
          FROM "y"
          LEFT JOIN LATERAL (${sellQuery}) "z" ON TRUE
          LEFT JOIN LATERAL (${buyQuery}) "w" ON TRUE
        `;
      } else if (query.collection) {
        baseQuery = `
          WITH "x" AS (
            SELECT DISTINCT ON ("t"."collection_id")
              "t"."collection_id",
              "t"."contract",
              "t"."token_id",
              "t"."name",
              "t"."image",
              "t"."floor_sell_id",
              "t"."floor_sell_value",
              "t"."floor_sell_maker",
              date_part('epoch', lower("os"."valid_between")) AS "floor_sell_valid_from",
              coalesce(
                nullif(date_part('epoch', upper("os"."valid_between")), 'Infinity'),
                0
              ) AS "floor_sell_valid_until",
              os.currency AS floor_sell_currency,
              coalesce(os.currency_value, os.value) AS floor_sell_currency_value,
              os.fee_bps AS floor_sell_fee_bps,
              os.normalized_value AS floor_sell_normalized_value,
              os.currency_normalized_value AS floor_sell_currency_normalized_value
            FROM "tokens" "t"
            LEFT JOIN "orders" "os"
              ON "t"."floor_sell_id" = "os"."id"
            WHERE "t"."collection_id" = $/collection/
            ORDER BY "t"."collection_id", "t"."floor_sell_value"
            LIMIT 1
          )
          SELECT
            "c"."token_count",
            "c"."token_set_id",
            (
              SELECT COUNT(*) FROM "tokens"
              WHERE "collection_id" = $/collection/
                AND "floor_sell_value" IS NOT NULL
            ) AS "on_sale_count",
            (
              SELECT COUNT(*) FROM "tokens"
              WHERE "collection_id" = $/collection/
                AND "is_flagged" = 1
            ) AS "flagged_token_count",
            array(
              SELECT "t"."image" FROM "tokens" "t"
              WHERE "t"."collection_id" = $/collection/
              AND "t"."image" IS NOT NULL
              LIMIT 4
            ) AS "sample_images",
            "x".*,
            "y".*
          FROM "x"
          JOIN "collections" "c"
            ON "x"."collection_id" = "c"."id"
          LEFT JOIN LATERAL (
            SELECT
              "ts"."top_buy_id",
              "ts"."top_buy_value",
              "ts"."top_buy_maker",
              date_part('epoch', lower("ob"."valid_between")) AS "top_buy_valid_from",
              coalesce(
                nullif(date_part('epoch', upper("ob"."valid_between")), 'Infinity'),
                0
              ) AS "top_buy_valid_until",
              ob.price AS top_buy_price,
              ob.currency AS top_buy_currency,
              coalesce(ob.currency_price, ob.price) AS top_buy_currency_price,
              coalesce(ob.currency_value, ob.value) AS top_buy_currency_value
            FROM "token_sets" "ts"
            LEFT JOIN "orders" "ob"
              ON "ts"."top_buy_id" = "ob"."id"
            WHERE "ts"."id" = "c"."token_set_id"
            ORDER BY "ts"."top_buy_value" DESC NULLS LAST
            LIMIT 1
          ) "y" ON TRUE
        `;
      }

      const result = await redb.oneOrNone(baseQuery!, query).then(async (r) =>
        r
          ? {
              tokenCount: Number(r.token_count),
              onSaleCount: Number(r.on_sale_count),
              flaggedTokenCount: Number(r.flagged_token_count),
              sampleImages: Assets.getLocalAssetsLink(r.sample_images) || [],
              market: {
                floorAsk: {
                  id: r.floor_sell_id,
                  price: r.floor_sell_id
                    ? await getJoiPriceObject(
                        {
                          net: {
                            amount: query.normalizeRoyalties
                              ? r.floor_sell_currency_normalized_value ??
                                getNetAmount(
                                  r.floor_sell_currency_value ?? r.floor_sell_value,
                                  r.floor_sell_fee_bps
                                )
                              : getNetAmount(
                                  r.floor_sell_currency_value ?? r.floor_sell_value,
                                  r.floor_sell_fee_bps
                                ),
                            nativeAmount: query.normalizeRoyalties
                              ? r.floor_sell_normalized_value ??
                                getNetAmount(r.floor_sell_value, r.floor_sell_fee_bps)
                              : getNetAmount(r.floor_sell_value, r.floor_sell_fee_bps),
                          },
                          gross: {
                            amount: r.floor_sell_currency_value ?? r.floor_sell_value,
                            nativeAmount: r.floor_sell_value,
                          },
                        },
                        fromBuffer(r.floor_sell_currency)
                      )
                    : null,
                  maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
                  validFrom: r.floor_sell_valid_from,
                  validUntil: r.floor_sell_value ? r.floor_sell_valid_until : null,
                  token: {
                    contract: r.contract ? fromBuffer(r.contract) : null,
                    tokenId: r.token_id,
                    name: r.name,
                    image: Assets.getLocalAssetsLink(r.image),
                  },
                },
                topBid: {
                  id: r.top_buy_id,
                  price: r.top_buy_id
                    ? await getJoiPriceObject(
                        {
                          net: {
                            amount: query.normalizeRoyalties
                              ? r.top_buy_currency_normalized_value ?? r.top_buy_value
                              : r.top_buy_currency_value ?? r.top_buy_value,
                            nativeAmount: query.normalizeRoyalties
                              ? r.top_buy_normalized_value ?? r.top_buy_value
                              : r.top_buy_value,
                          },
                          gross: {
                            amount: r.top_buy_currency_price ?? r.top_buy_price,
                            nativeAmount: r.top_buy_price,
                          },
                        },
                        fromBuffer(r.top_buy_currency)
                      )
                    : null,
                  maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
                  validFrom: r.top_buy_valid_from,
                  validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
                },
              },
            }
          : null
      );

      return { stats: result };
    } catch (error) {
      logger.error(`get-stats-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
