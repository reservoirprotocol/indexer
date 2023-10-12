/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { regex } from "@/common/utils";
import MetadataProviderRouter from "@/metadata/metadata-provider-router";

export const getProviderMetadata: RouteOptions = {
  description: "Get metadata for a token or collection",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    params: Joi.object({
      type: Joi.string()
        .valid("token", "collection")
        .description("Fetch metadata for a token or collection"),
    }),
    query: Joi.object({
      tokens: Joi.alternatives()
        .try(
          Joi.array()
            .max(50)
            .items(Joi.string().lowercase().pattern(regex.token))
            .description(
              "Array of tokens. Max limit is 50. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
            ),
          Joi.string()
            .lowercase()
            .pattern(regex.token)
            .description(
              "Array of tokens. Max limit is 50. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
            )
        )
        .required(),
      method: Joi.string().description("The indexing method to use"),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const query = request.query as any;
    const params = request.params as any;
    if (!_.isArray(query.tokens)) {
      query.tokens = [query.tokens];
    }

    try {
      if (params.type === "collection") {
        const [contract, tokenId] = query.tokens[0].split(":");
        return await MetadataProviderRouter.getCollectionMetadata(contract, tokenId, "", {
          indexingMethod: query.method,
        });
      } else {
        return await MetadataProviderRouter.getTokensMetadata(
          query.tokens.map((token: string) => {
            const [contract, tokenId] = token.split(":");
            return { contract, tokenId };
          }),
          query.method
        );
      }
    } catch (error) {
      logger.error("get-provider-metadata-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
