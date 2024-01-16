/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";

const version = "v1";

export const getOwnersCountV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60 * 60 * 1000,
  },
  description: "Owners Count",
  notes:
    "Get total owners count for a specific token. Useful for 1155 tokens, where you want to know the exact amount of owners.",
  tags: ["api", "Owners"],
  plugins: {
    "hapi-swagger": {
      order: 6,
    },
  },
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .description(
          "Filter to a particular contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
    }).xor("contract", "token"),
  },
  response: {
    schema: Joi.object({
      owners: Joi.number(),
    }).label(`getOwnerCount${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-owners-count-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    let tokensFilter = "";

    if (query.contract) {
      (query as any).contract = toBuffer(query.contract);
      tokensFilter = `tokens.contract = $/contract/`;
    } else if (query.token) {
      const [contract, tokenId] = query.token.split(":");
      (query as any).contract = toBuffer(contract);
      (query as any).tokenId = tokenId;
      tokensFilter = `tokens.contract = $/contract/ AND tokens.token_id = $/tokenId/`;
    } else {
      throw new Error("Either contract or token must be provided");
    }

    try {
      const baseQuery = `
        SELECT COUNT(*) FILTER (WHERE nft_balances.amount > 0) AS owners_count
        FROM nft_balances
        JOIN tokens ON nft_balances.contract = tokens.contract AND nft_balances.token_id = tokens.token_id
        WHERE ${tokensFilter}`;

      const owners = await redb.manyOrNone(baseQuery, query).then((result) => {
        return Number(result[0]?.owners_count ?? 0);
      });

      return { owners };
    } catch (error) {
      logger.error(`get-owners-count-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
