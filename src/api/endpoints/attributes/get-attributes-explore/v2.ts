/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer } from "@/common/utils";
import { Assets } from "@/utils/assets";
import { JoiAttributeValue } from "@/common/joi";

const version = "v2";

export const getAttributesExploreV2Options: RouteOptions = {
  description: "Explore attributes",
  notes: "Get detailed aggregate about attributes in a collection, attribute floors",
  tags: ["api", "x-deprecated"],
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
      sortBy: Joi.string()
        .valid("floorAskPrice", "topBidValue")
        .default("floorAskPrice")
        .description("Order the items are returned in the response."),
      offset: Joi.number()
        .integer()
        .min(0)
        .max(10000)
        .default(0)
        .description("Use offset to request the next batch of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(5000)
        .default(20)
        .description("Amount of items returned in response."),
    }),
  },
  response: {
    schema: Joi.object({
      attributes: Joi.array().items(
        Joi.object({
          key: Joi.string().required(),
          value: JoiAttributeValue,
          tokenCount: Joi.number().required(),
          onSaleCount: Joi.number().required(),
          sampleImages: Joi.array().items(Joi.string().allow("", null)),
          floorAskPrices: Joi.array().items(Joi.number().unsafe()),
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
    let attributeKeyFilter = "";
    let sortBy = "ORDER BY floor_sell_value DESC NULLS LAST";

    if (query.attributeKey) {
      attributeKeyFilter = `AND attributes.key = $/attributeKey/`;
    }

    // Sorting
    switch (query.sortBy) {
      case "topBuyValue": {
        sortBy = "ORDER BY top_buy_value DESC NULLS LAST";
        break;
      }
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
            ) FILTER (WHERE tokens.last_sell_value IS NOT NULL AND tokens.last_sell_value > 0) )::json[])[1:${query.maxLastSells}] AS "last_sells"
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

    try {
      const attributesQuery = `
            SELECT attributes.id, floor_sell_value, token_count, on_sale_count, key, value, sample_images, recent_floor_values_info.*, top_buy_info.*
            FROM attributes
            LEFT JOIN LATERAL (
                SELECT  token_sets.top_buy_id,
                        token_sets.top_buy_value,
                        token_sets.top_buy_maker,
                        date_part('epoch', lower(orders.valid_between)) AS "top_buy_valid_from",
                        coalesce(nullif(date_part('epoch', upper(orders.valid_between)), 'Infinity'), 0) AS "top_buy_valid_until"
                FROM token_sets
                LEFT JOIN orders ON token_sets.top_buy_id = orders.id
                WHERE token_sets.attribute_id = attributes.id
                ORDER BY token_sets.top_buy_value DESC NULLS LAST
                LIMIT 1
            ) "top_buy_info" ON TRUE
            JOIN LATERAL (
                ${tokensInfoQuery}
            ) "recent_floor_values_info" ON TRUE
            WHERE attributes.collection_id = $/collection/
            ${attributeKeyFilter}
            ${sortBy}
            OFFSET $/offset/
            LIMIT $/limit/`;

      const attributesData = await redb.manyOrNone(attributesQuery, { ...query, ...params });

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
        lastSells: query.maxLastSells
          ? (r.last_sells || []).map(({ tokenId, value, timestamp }: any) => ({
              tokenId: `${tokenId}`,
              value: formatEth(value),
              timestamp: Number(timestamp),
            }))
          : [],
        topBid: {
          id: r.top_buy_id,
          value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
          maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
          validFrom: r.top_buy_valid_from,
          validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
        },
      }));

      return { attributes: result };
    } catch (error) {
      logger.error(`get-attributes-explore-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
