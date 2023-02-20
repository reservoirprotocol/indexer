/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiAttributeValue } from "@/common/joi";

const version = "v1";

export const getAttributesAllV1Options: RouteOptions = {
  description: "Get all attributes in a collection",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
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
  },
  response: {
    schema: Joi.object({
      attributes: Joi.array().items(
        Joi.object({
          key: Joi.string().required(),
          kind: Joi.string().valid("string", "number", "date", "range").required(),
          values: Joi.array().items(
            Joi.object({
              value: JoiAttributeValue,
              count: Joi.number(),
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

    try {
      const baseQuery = `
        SELECT
          "ak"."key",
          "ak"."kind",
          array_agg(json_build_object('value', "a"."value", 'count', "a"."token_count")) AS "values"
        FROM "attribute_keys" "ak"
        JOIN "attributes" "a"
          ON "ak"."id" = "a"."attribute_key_id"
        WHERE "ak"."collection_id" = $/collection/
          AND "ak"."rank" IS NOT NULL
          AND "a"."token_count" > 0
        GROUP BY "ak"."id"
        ORDER BY "ak"."rank" DESC
      `;

      const result = await redb.manyOrNone(baseQuery, params).then((result) =>
        result.map((r) => ({
          key: r.key,
          kind: r.kind,
          values: r.values,
        }))
      );

      return { attributes: result };
    } catch (error) {
      logger.error(`get-attributes-all-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
