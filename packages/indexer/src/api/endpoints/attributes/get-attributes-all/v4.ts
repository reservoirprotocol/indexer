/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { getJoiPriceObject, JoiAttributeValue, JoiPrice } from "@/common/joi";
import { config } from "@/config/index";
import * as Sdk from "@reservoir0x/sdk";
import { regex } from "@/common/utils";

const version = "v4";

export const getAttributesAllV4Options: RouteOptions = {
  description: "All attributes",
  notes:
    "Use this API to see all possible attributes within a collection.\n\n- `floorAskPrice` for all attributes might not be returned on collections with more than 10k tokens. \n\n- Attributes are case sensitive. \n\n- Attributes will return a maximum of 500 values.",
  tags: ["api", "Attributes"],
  plugins: {
    "hapi-swagger": {
      order: 2,
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
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Return result in given currency"),
    }),
  },
  response: {
    schema: Joi.object({
      attributes: Joi.array().items(
        Joi.object({
          key: Joi.string().required().description("Case sensitive"),
          attributeCount: Joi.number().description("Number of possible attribute kinds"),
          kind: Joi.string().valid("string", "number", "date", "range").required(),
          minRange: Joi.number().unsafe().allow(null),
          maxRange: Joi.number().unsafe().allow(null),
          values: Joi.array().items(
            Joi.object({
              value: JoiAttributeValue.description("Case sensitive"),
              count: Joi.number(),
              floorAskPrice: JoiPrice.allow(null).description(
                "Returned only for attributes with less than 10k tokens"
              ),
            })
          ),
        })
      ),
    }).label(`getAttributesAll${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-attributes-all-${version}-handler`, `Wrong response schema: ${error}`);

      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      const baseQuery = `
        SELECT 
          key, 
          kind, 
          rank, 
          attribute_count, 
          array_agg(info) AS "values" 
        FROM 
          attribute_keys 
        WHERE 
          collection_id = $/collection/
          AND kind = 'number' 
        GROUP BY 
          id 
        UNION 
        SELECT 
          attribute_keys.key, 
          attribute_keys.kind, 
          rank, 
          attribute_count, 
          array_agg(
            jsonb_build_object(
              'value', attributes.value, 'count', 
              attributes.token_count, 'floor_sell_value', 
              attributes.floor_sell_value :: text
            )
          ) AS "values" 
        FROM 
          attribute_keys 
          JOIN attributes ON attribute_keys.id = attributes.attribute_key_id 
        WHERE 
          attribute_keys.collection_id = $/collection/ 
          AND attribute_keys.kind = 'string' 
          AND attribute_keys.attribute_count <= 500
          AND attributes.token_count > 0 
        GROUP BY 
          attribute_keys.id 
        UNION 
        SELECT 
          attribute_keys.key, 
          attribute_keys.kind, 
          rank, 
          '500' AS "attribute_count", 
          o.* 
        FROM 
          attribute_keys 
          LEFT JOIN LATERAL (
            SELECT 
              array_agg(
                jsonb_build_object (
                  'value', tmp.value, 'count', tmp.token_count, 
                  'floor_sell_value', tmp.floor_sell_value :: text
                )
              ) AS "values" 
            FROM 
              (
                SELECT 
                  * 
                FROM 
                  attributes 
                WHERE 
                  attributes.attribute_key_id = attribute_keys.id
                  AND attributes.token_count > 0
                LIMIT 
                  500
              ) tmp
          ) o ON TRUE 
        WHERE 
          attribute_keys.collection_id = $/collection/
          AND attribute_keys.kind = 'string' 
          AND attribute_keys.attribute_count > 500 
        ORDER BY 
          rank DESC
      `;

      const result = await redb.manyOrNone(baseQuery, params).then((result) => {
        return result.map(async (r) => {
          if (r.values.count == 0) {
            return undefined;
          }

          if (r.kind == "number") {
            return {
              key: r.key,
              kind: r.kind,
              minRange: _.isArray(r.values)
                ? Number((_.first(r.values) as any)["min_range"])
                : null,
              maxRange: _.isArray(r.values)
                ? Number((_.first(r.values) as any)["max_range"])
                : null,
            };
          } else {
            return {
              key: r.key,
              attributeCount: Number(r.attribute_count),
              kind: r.kind,
              values: await Promise.all(
                _.map(r.values, async (value) => ({
                  count: value.count,
                  value: value.value,
                  floorAskPrice:
                    value.floor_sell_value && value.count <= 10000
                      ? await getJoiPriceObject(
                          {
                            gross: {
                              amount: String(value.floor_sell_value),
                              nativeAmount: String(value.floor_sell_value),
                            },
                          },
                          Sdk.Common.Addresses.Native[config.chainId],
                          query.displayCurrency
                        )
                      : undefined,
                }))
              ),
            };
          }
        });
      });

      return { attributes: await Promise.all(result) };
    } catch (error) {
      logger.error(`get-attributes-all-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
