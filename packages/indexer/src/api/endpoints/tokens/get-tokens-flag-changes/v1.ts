/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { buildContinuation, fromBuffer, regex, splitContinuation } from "@/common/utils";

const version = "v1";

export const getFlaggedTokensChangesV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 5000,
  },
  description: "Flagged Tokens",
  notes:
    "This API return the recent flagged/un-flagged tokens across all collections sorted by change time",
  tags: ["api", "Tokens"],
  plugins: {
    "hapi-swagger": {
      order: 10,
    },
  },
  validate: {
    query: Joi.object({
      flagStatus: Joi.number()
        .allow(-1, 0, 1)
        .description("-1 = All tokens (default)\n0 = Non flagged tokens\n1 = Flagged tokens"),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(200)
        .default(200)
        .description("Amount of items returned in response."),
      continuation: Joi.string().description(
        "Use continuation token to request next offset of items."
      ),
    }),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          tokenId: Joi.string().pattern(regex.number).required(),
          lastFlagChange: Joi.string(),
          isFlagged: Joi.boolean().default(false),
          contract: Joi.string().lowercase().pattern(regex.address).required(),
        })
      ),
      continuation: Joi.string().allow(null),
    }).label(`getFlaggedTokens${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-flagged-tokens-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          token_id,
          is_flagged,
          contract,
          last_flag_change
        FROM tokens
      `;

      // Filters
      const conditions: string[] = [];

      if (_.indexOf([0, 1], query.flagStatus) !== -1) {
        conditions.push(`is_flagged = $/flagStatus/`);
      }

      if (query.continuation) {
        query.continuation = splitContinuation(query.continuation)[0];
        conditions.push(`last_flag_change < $/continuation/`);
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      baseQuery += ` ORDER BY last_flag_change DESC NULLS LAST`;
      baseQuery += ` LIMIT $/limit/`;

      const tokens = await redb.manyOrNone(baseQuery, query);
      const result = _.map(tokens, (token) => ({
        tokenId: token.token_id,
        contract: fromBuffer(token.contract),
        isFlagged: Boolean(Number(token.is_flagged)),
        lastFlagChange: new Date(token.last_flag_change).toISOString(),
      }));

      let continuation = null;
      if (tokens.length === query.limit) {
        continuation = buildContinuation(
          new Date(tokens[tokens.length - 1].last_flag_change).toISOString()
        );
      }

      return { tokens: result, continuation };
    } catch (error) {
      logger.error(`get-flagged-tokens-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
