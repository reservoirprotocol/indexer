/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { regex, toBuffer } from "@/common/utils";

const version = "v1";

export const getTokensIdsV1Options: RouteOptions = {
  description: "Token IDs",
  notes:
    "This API is optimized for quickly fetching a list of tokens ids in by collection, contract, token set id. ",
  tags: ["api", "Tokens"],
  plugins: {
    "hapi-swagger": {
      order: 9,
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
      tokenSetId: Joi.string().description(
        "Filter to a particular token set. Example: `token:CONTRACT:TOKEN_ID` representing a single token within contract, `contract:CONTRACT` representing a whole contract, `range:CONTRACT:START_TOKEN_ID:END_TOKEN_ID` representing a continuous token id range within a contract and `list:CONTRACT:TOKEN_IDS_HASH` representing a list of token ids within a contract."
      ),
      flagStatus: Joi.number()
        .allow(-1, 0, 1)
        .description("-1 = All tokens (default)\n0 = Non flagged tokens\n1 = Flagged tokens"),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(10000)
        .default(100)
        .description("Amount of items returned in response. Max limit is 10,000."),
      continuation: Joi.string()
        .pattern(regex.number)
        .description("Use continuation token to request next offset of items."),
    })
      .or("collection", "contract", "tokenSetId")
      .oxor("collection", "contract", "tokenSetId")
      .with("flagStatus", "collection"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(Joi.string().pattern(regex.number)),
      continuation: Joi.string().pattern(regex.number).allow(null),
    }).label(`getTokensIds${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-tokens-ids-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          "t"."token_id"
        FROM "tokens" "t"
      `;

      // Filters
      const conditions: string[] = [];

      if (query.collection) {
        conditions.push(`"t"."collection_id" = $/collection/`);
      } else if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`"t"."contract" = $/contract/`);
      } else if (query.tokenSetId) {
        baseQuery += `
          JOIN "token_sets_tokens" "tst"
            ON "t"."contract" = "tst"."contract"
            AND "t"."token_id" = "tst"."token_id"
        `;

        conditions.push(`"tst"."token_set_id" = $/tokenSetId/`);
      }

      if (_.indexOf([0, 1], query.flagStatus) !== -1) {
        conditions.push(`"t"."is_flagged" = $/flagStatus/`);
      }

      // Continue with the next page, this depends on the sorting used
      if (query.continuation) {
        conditions.push(`("t"."token_id") > ($/contTokenId/)`);

        (query as any).contTokenId = query.continuation;
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += ` ORDER BY "t"."contract", "t"."token_id"`;
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        continuation = rawResult[rawResult.length - 1].token_id;
      }

      const result = rawResult.map((r) => r.token_id);

      return {
        tokens: result,
        continuation,
      };
    } catch (error) {
      logger.error(`get-tokens-ids-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
