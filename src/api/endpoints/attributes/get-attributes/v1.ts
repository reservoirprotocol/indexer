/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiAttributeValue } from "@/common/joi";

const version = "v1";

export const getAttributesV1Options: RouteOptions = {
  description: "List of attributes",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
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
    }).label(`getAttributes${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-attributes-${version}-handler`, `Wrong response schema: ${error}`);

      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

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
        GROUP BY "ak"."id"
        ORDER BY "ak"."rank" DESC
      `;

      const result = await redb.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => ({
          key: r.key,
          kind: r.kind,
          values: r.values,
        }))
      );

      return { attributes: result };
    } catch (error) {
      logger.error(`get-attributes-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
