/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/common/helpers/merkle";
import Joi from "joi";

import { logger } from "@/common/logger";
import { generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";

const version = "v1";

export const postTokenSetsV1Options: RouteOptions = {
  description: "Create a token set",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  validate: {
    payload: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .description(
          "Array of tokens to gather in a set. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        )
        .required(),

      tokenIds: Joi.array().items(Joi.string().lowercase().pattern(/^\d+$/)).required(),
    }),
  },
  response: {
    schema: Joi.object({
      id: Joi.string(),
    }).label(`postTokenSets${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-token-sets-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    try {
      const contract = payload.contract;
      const tokenIds = payload.tokenIds;

      if (tokenIds.length <= 1) {
        throw Boom.badRequest("Token sets should contain at least 2 tokens");
      }
      if (tokenIds.length > 10000) {
        throw Boom.badRequest("Token sets are restricted to at most 10000 tokens");
      }

      const merkleTree = generateMerkleTree(tokenIds);

      const ts = await tokenSet.tokenList.save([
        {
          id: `list:${contract}:${merkleTree.getHexRoot()}`,
          schemaHash: generateSchemaHash(undefined),
          items: {
            contract,
            tokenIds,
          },
        },
      ]);

      if (ts.length !== 1) {
        throw Boom.internal("Could not save token set");
      }

      return { id: ts[0].id };
    } catch (error) {
      logger.error(`post-token-sets-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
