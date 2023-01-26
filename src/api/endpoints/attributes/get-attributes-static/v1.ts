/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import * as Boom from "@hapi/boom";
import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { Collections } from "@/models/collections";
import { JoiAttributeValue } from "@/common/joi";

const version = "v1";

export const getAttributesStaticV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 1000 * 60 * 60 * 24,
  },
  description: "All attributes + token ids",
  tags: ["api", "x-deprecated"],
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
  },
  response: {
    schema: Joi.object({
      attributes: Joi.array().items(
        Joi.object({
          key: Joi.string().allow("").required(),
          kind: Joi.string().valid("string", "number", "date", "range").required(),
          values: Joi.array().items(
            Joi.object({
              value: JoiAttributeValue,
              count: Joi.number(),
              tokens: Joi.array().items(Joi.string().required()),
            })
          ),
        })
      ),
    }).label(`getAttributesStatic${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-attributes-static-${version}-handler`, `Wrong response schema: ${error}`);

      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;

    const collection = await Collections.getById(params.collection);
    if (!collection || collection?.tokenCount > 30000) {
      throw Boom.badData("Collection not supported");
    }

    try {
      const baseQuery = `
        SELECT
          "ak"."key",
          "ak"."kind",
          array_agg(json_build_object(
            'value', "a"."value",
            'count', "a"."token_count",
            'tokens', (
              SELECT array_agg("ta"."token_id")::TEXT[] FROM "token_attributes" "ta"
              WHERE "ta"."attribute_id" = "a"."id"
            )
          )) AS "values"
        FROM "attribute_keys" "ak"
        JOIN "attributes" "a"
          ON "ak"."id" = "a"."attribute_key_id"
        WHERE "ak"."collection_id" = $/collection/
          AND "ak"."rank" IS NOT NULL
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
      logger.error(`get-attributes-static-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
