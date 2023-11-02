/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import {
  buildContinuation,
  formatEth,
  fromBuffer,
  regex,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { Sources } from "@/models/sources";
import { Assets } from "@/utils/assets";
import { getJoiTokenObject } from "@/common/joi";

const version = "v1";

export const getTokensBootstrapV1Options: RouteOptions = {
  description: "Token Events Bootstrap",
  notes:
    "Get the latest price event per token in a collection, so that you can listen to future events and keep track of prices",
  tags: ["api", "Tokens"],
  plugins: {
    "hapi-swagger": {
      order: 10,
    },
  },
  validate: {
    query: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      contract: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Filter to a particular contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(500)
        .default(500)
        .description("Amount of items returned in response."),
    })
      .or("collection", "contract")
      .oxor("collection", "contract"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          contract: Joi.string().lowercase().pattern(regex.address),
          tokenId: Joi.string().pattern(regex.number),
          image: Joi.string().allow("", null),
          orderId: Joi.string(),
          maker: Joi.string().lowercase().pattern(regex.address),
          validFrom: Joi.number().unsafe(),
          validUntil: Joi.number().unsafe(),
          price: Joi.number().unsafe().description("Native currency of chain"),
          source: Joi.string().allow("", null),
        })
      ),
      continuation: Joi.string().pattern(regex.base64),
    }).label(`getTokensBootstrap${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-tokens-bootstrap-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          "t"."contract",
          "t"."token_id",
          "t"."image",
          "t"."metadata_disabled" as "t_metadata_disabled",
          "c"."metadata_disabled" as "c_metadata_disabled",
          "t"."floor_sell_id",
          "t"."floor_sell_value",
          "t"."floor_sell_maker",
          "t"."floor_sell_source_id_int",
          "t"."floor_sell_valid_from",
          "t"."floor_sell_valid_to"
        FROM "tokens" "t"
        JOIN "collections" "c"
          ON "t"."collection_id" = "c"."id"
      `;

      // Filters
      const conditions: string[] = [`"t"."floor_sell_value" IS NOT NULL`];
      if (query.collection) {
        conditions.push(`"t"."collection_id" = $/collection/`);
      }
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`"t"."contract" = $/contract/`);
      }
      if (query.continuation) {
        const [floorSellValue, tokenId] = splitContinuation(query.continuation, /^\d+_\d+$/);
        (query as any).continuationFloorSellValue = floorSellValue;
        (query as any).continuationTokenId = tokenId;

        conditions.push(
          `
            ("t"."floor_sell_value", "t"."token_id") > ($/continuationFloorSellValue/, $/continuationTokenId/)
            OR ("t"."floor_sell_value" IS NULL)
          `
        );
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += ` ORDER BY "t"."floor_sell_value", "t"."token_id"`;

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      const sources = await Sources.getInstance();
      const result = rawResult.map((r) => {
        return getJoiTokenObject(
          {
            contract: fromBuffer(r.contract),
            tokenId: r.token_id,
            image: Assets.getLocalAssetsLink(r.image),
            orderId: r.floor_sell_id,
            maker: fromBuffer(r.floor_sell_maker),
            price: formatEth(r.floor_sell_value),
            validFrom: Number(r.floor_sell_valid_from),
            validUntil: Number(r.floor_sell_valid_to),
            source: sources.get(r.floor_sell_source_id_int)?.name,
          },
          r.t_metadata_disabled,
          r.c_metadata_disabled
        );
      });

      let continuation: string | undefined;
      if (rawResult.length && rawResult.length >= query.limit) {
        const lastResult = rawResult[rawResult.length - 1];
        continuation = buildContinuation(`${lastResult.floor_sell_value}_${lastResult.token_id}`);
      }

      return { tokens: result, continuation };
    } catch (error) {
      logger.error(`get-tokens-bootstrap-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
