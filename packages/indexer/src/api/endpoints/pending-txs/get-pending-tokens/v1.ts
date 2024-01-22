import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import * as pendingTxs from "@/utils/pending-txs";

const version = "v1";

export const getPendingTokensV1Options: RouteOptions = {
  description: "Pending tokens",
  notes: "Get tokens which have a pending sale transaction",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 6,
    },
  },
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Filter to a particular contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
  },
  response: {
    schema: Joi.object({
      items: Joi.array().items(
        Joi.object({
          tokenId: Joi.string().pattern(regex.number),
          contract: Joi.string(),
          txHash: Joi.string(),
        })
      ),
    }).label(`getPendingTokens${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-pending-tokens-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = request.query as any;

    try {
      const items = await pendingTxs.getPendingItems(query.contract);
      return { items };
    } catch (error) {
      logger.error(`get-pending-tokens-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
