/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { buildContinuation, formatEth, fromBuffer, regex, splitContinuation } from "@/common/utils";
import { Assets } from "@/utils/assets";
import { JoiAttributeValue } from "@/common/joi";
import * as Boom from "@hapi/boom";

const version = "v4";

export const getAttributesExploreV4Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 10000,
  },
  description: "Explore attributes",
  notes:
    "Use this API to see stats on a specific attribute within a collection. This endpoint will return `tokenCount`, `onSaleCount`, `sampleImages`, and `floorAsk` by default. ",
  tags: ["api", "x-deprecated", "Attributes"],
  plugins: {
    "hapi-swagger": {
      order: 15,
    },
  },
  validate: {
    params: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
    query: Joi.object({
      tokenId: Joi.string().description("Filter to a particular token-id. Example: `1`"),
      includeTopBid: Joi.boolean()
        .default(false)
        .description("If true, top bid will be returned in the response."),
      excludeRangeTraits: Joi.boolean()
        .default(false)
        .description("If true, range traits will be excluded from the response."),
      excludeNumberTraits: Joi.boolean()
        .default(false)
        .description("If true, number traits will be excluded from the response."),
      attributeKey: Joi.string().description(
        "Filter to a particular attribute key. Example: `Composition`"
      ),
      maxFloorAskPrices: Joi.number()
        .integer()
        .min(1)
        .max(20)
        .default(1)
        .description("Max number of items returned in the response."),
      maxLastSells: Joi.number()
        .integer()
        .min(0)
        .max(20)
        .default(0)
        .description("Max number of items returned in the response."),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(5000)
        .default(20)
        .description(
          "Amount of items returned in response. Default limit is 20. Max limit is 5000."
        ),
    }),
  },
  response: {
    schema: Joi.object({
      attributes: Joi.array().items(
        Joi.object({
          key: Joi.string().required().description("Case sensitive"),
          value: JoiAttributeValue.description("Case sensitive"),
          tokenCount: Joi.number().required().description("Total token count with this attribute."),
          onSaleCount: Joi.number()
            .required()
            .description("Token count with this attribute on sale."),
          sampleImages: Joi.array().items(Joi.string().allow("", null)),
          floorAskPrices: Joi.array()
            .items(Joi.number().unsafe())
            .description("Current floor price ask."),
          lastBuys: Joi.array().items(
            Joi.object({
              tokenId: Joi.string().required(),
              value: Joi.number().unsafe().required(),
              timestamp: Joi.number().required(),
            })
          ),
          lastSells: Joi.array().items(
            Joi.object({
              tokenId: Joi.string().required(),
              value: Joi.number().unsafe().required(),
              timestamp: Joi.number().required(),
            })
          ),
          topBid: Joi.object({
            id: Joi.string().allow(null),
            value: Joi.number().unsafe().allow(null),
            maker: Joi.string()
              .lowercase()
              .pattern(/^0x[a-fA-F0-9]{40}$/)
              .allow(null),
            validFrom: Joi.number().unsafe().allow(null),
            validUntil: Joi.number().unsafe().allow(null),
          }).optional(),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getAttributesExplore${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-attributes-explore-${version}-handler`, `Wrong response schema: ${error}`);

      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;
    const params = request.params as any;
    const conditions: string[] = [];
    let selectQuery =
      "SELECT attributes.id, kind, floor_sell_value, token_count, on_sale_count, attributes.key, attributes.value, sample_images, recent_floor_values_info.*";

    conditions.push(`attributes.collection_id = $/collection/`);

    let tokenFilterQuery = "";
    if (query.tokenId) {
      tokenFilterQuery = `INNER JOIN token_attributes ta ON attributes.id = ta.attribute_id AND ta.token_id = $/tokenId/`;
    }

    if (query.attributeKey) {
      conditions.push(`attributes.key = $/attributeKey/`);
    }

    if (query.excludeRangeTraits) {
      conditions.push("attributes.kind != 'range'");
    }

    if (query.excludeNumberTraits) {
      conditions.push("attributes.kind != 'number'");
    }

    // If the client asks for multiple floor prices
    let tokensInfoQuery = `SELECT NULL AS "floor_sell_values"`;
    const tokenInfoSelectColumns = [];
    if (query.maxFloorAskPrices > 1) {
      tokenInfoSelectColumns.push(`
            (
                (array_agg(tokens.floor_sell_value ORDER BY tokens.floor_sell_value)
                 FILTER (WHERE tokens.floor_sell_value IS NOT NULL)
                )::text[]
            )[1:${query.maxFloorAskPrices}] AS "floor_sell_values"
      `);
    }

    if (query.maxLastSells) {
      tokenInfoSelectColumns.push(`
            ((array_agg(
              json_build_object(
                'tokenId', tokens.token_id,
                'value', tokens.last_sell_value::text,
                'timestamp', tokens.last_sell_timestamp
              ) ORDER BY tokens.last_sell_timestamp DESC
            ) FILTER (WHERE tokens.last_sell_value IS NOT NULL AND tokens.last_sell_value > 0) )::json[])[1:${query.maxLastSells}] AS "last_sells",
            ((array_agg(
              json_build_object(
                'tokenId', tokens.token_id,
                'value', tokens.last_buy_value::text,
                'timestamp', tokens.last_buy_timestamp
              ) ORDER BY tokens.last_buy_timestamp DESC
            ) FILTER (WHERE tokens.last_buy_value IS NOT NULL))::json[])[1:${query.maxLastSells}] AS "last_buys"
      `);
    }

    if (!_.isEmpty(tokenInfoSelectColumns)) {
      tokensInfoQuery = `
        SELECT ${_.join(tokenInfoSelectColumns, ",")}
        FROM token_attributes
        JOIN tokens ON token_attributes.contract = tokens.contract AND token_attributes.token_id = tokens.token_id
        WHERE token_attributes.attribute_id = attributes.id
        GROUP BY token_attributes.attribute_id
      `;
    }

    let topBidQuery = "";
    if (query.includeTopBid) {
      selectQuery += ", top_buy_info.*";

      topBidQuery = `LEFT JOIN LATERAL (
          SELECT  token_sets.top_buy_id,
                  token_sets.top_buy_value,
                  token_sets.top_buy_maker,
                  date_part('epoch', lower(orders.valid_between)) AS "top_buy_valid_from",
                  coalesce(nullif(date_part('epoch', upper(orders.valid_between)), 'Infinity'), 0) AS "top_buy_valid_until"
          FROM token_sets
          JOIN orders ON token_sets.top_buy_id = orders.id
          WHERE token_sets.attribute_id = attributes.id
          ORDER BY token_sets.top_buy_value DESC NULLS LAST
          LIMIT 1
      ) "top_buy_info" ON TRUE`;
    }

    try {
      let attributesQuery = `
            ${selectQuery}
            FROM attributes
            ${tokenFilterQuery}
             ${topBidQuery}
            JOIN LATERAL (
                ${tokensInfoQuery}
            ) "recent_floor_values_info" ON TRUE
            `;

      if (query.continuation) {
        const contArr = splitContinuation(query.continuation, /^[0-9]+_[^_]+_[^_]+$/);
        if (contArr.length !== 3) {
          throw Boom.badRequest("Invalid continuation string used");
        }
        conditions.push(
          `COALESCE(CAST(floor_sell_value AS numeric), CAST(0 AS numeric)) <= CAST($/contFloorSellValue/ AS numeric)`
        );
        conditions.push(`(key, value) < ($/contKey/, $/contValue/)`);
        (query as any).contFloorSellValue = contArr[0];
        (query as any).contKey = contArr[1];
        (query as any).contValue = contArr[2];
      }
      if (conditions.length) {
        attributesQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }
      attributesQuery += `
      ORDER BY floor_sell_value DESC NULLS LAST, key ASC, value ASC
      LIMIT $/limit/
      `;

      const attributesData = await redb.manyOrNone(attributesQuery, { ...query, ...params });

      let continuation = null;
      if (attributesData.length === query.limit) {
        continuation = buildContinuation(
          attributesData[attributesData.length - 1].floor_sell_value +
            "_" +
            attributesData[attributesData.length - 1].key +
            "_" +
            attributesData[attributesData.length - 1].value
        );
      }

      // If no attributes found return here
      if (_.isEmpty(attributesData)) {
        return { attributes: [] };
      }

      const result = _.map(attributesData, (r) => ({
        key: r.key,
        value: r.value,
        tokenCount: Number(r.token_count),
        onSaleCount: Number(r.on_sale_count),
        sampleImages: Assets.getLocalAssetsLink(r.sample_images) || [],
        floorAskPrices:
          query.maxFloorAskPrices > 1
            ? (r.floor_sell_values || []).map(formatEth)
            : [formatEth(r.floor_sell_value || 0)],
        lastBuys: query.maxLastSells
          ? (r.last_buys || []).map(({ tokenId, value, timestamp }: any) => ({
              tokenId: `${tokenId}`,
              value: formatEth(value),
              timestamp: Number(timestamp),
            }))
          : undefined,
        lastSells: query.maxLastSells
          ? (r.last_sells || []).map(({ tokenId, value, timestamp }: any) => ({
              tokenId: `${tokenId}`,
              value: formatEth(value),
              timestamp: Number(timestamp),
            }))
          : undefined,
        topBid: query.includeTopBid
          ? {
              id: r.top_buy_id,
              value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
              maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
              validFrom: r.top_buy_valid_from,
              validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
            }
          : undefined,
      }));

      return { attributes: result, continuation };
    } catch (error) {
      logger.error(`get-attributes-explore-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
