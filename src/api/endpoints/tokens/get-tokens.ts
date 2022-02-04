import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import * as queries from "@/entities/tokens/get-tokens";

export const getTokensOptions: RouteOptions = {
  description:
    "Get a list of tokens. Useful for showing the best priced tokens in a collection or attribute.",
  tags: ["api", "tokens"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      attributes: Joi.object().unknown(),
      tokenSetId: Joi.string().lowercase(),
      onSale: Joi.boolean(),
      sortBy: Joi.string()
        .valid("tokenId", "floorSellValue", "topBuyValue")
        .default("floorSellValue"),
      sortByAttribute: Joi.string(),
      sortDirection: Joi.string()
        .lowercase()
        .valid("asc", "desc")
        .default("asc"),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(20).default(50),
    })
      .or("contract", "collection", "tokenSetId")
      .oxor("contract", "collection", "tokenSetId"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          contract: Joi.string(),
          name: Joi.string().allow(null, ""),
          image: Joi.string().allow(null, ""),
          tokenId: Joi.string(),
          collection: Joi.object({
            id: Joi.string(),
            name: Joi.string(),
          }),
          topBuyValue: Joi.number().unsafe().allow(null),
          floorSellValue: Joi.number().unsafe().allow(null),
        })
      ),
    }).label("getTokensResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get_tokens_handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const tokens = await queries.getTokens(query as queries.GetTokensFilter);

      return { tokens };
    } catch (error) {
      logger.error("get_tokens_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
