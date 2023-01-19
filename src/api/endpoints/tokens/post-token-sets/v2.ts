import { keccak256 } from "@ethersproject/solidity";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/common/helpers/merkle";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { config } from "@/config/index";
import { generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";

const version = "v2";

export const postTokenSetsV2Options: RouteOptions = {
  description: "Create token set",
  tags: ["api", "Tokens"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  timeout: {
    server: 60 * 1000,
  },
  payload: {
    // 10 MB
    maxBytes: 1048576 * 10,
  },
  validate: {
    payload: Joi.object({
      tokens: Joi.array().items(Joi.string().pattern(regex.token)).required(),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      const tokens = payload.tokens as string[];

      if (tokens.length <= 1) {
        throw Boom.badRequest("Token sets should contain at least 2 tokens");
      }
      if (tokens.length > config.maxTokenSetSize) {
        throw Boom.badRequest("Token sets are restricted to at most 10000 tokens");
      }

      // Extract all unique contracts
      const contracts = new Set<string>();
      for (const token of tokens) {
        contracts.add(token.split(":")[0]);
      }

      if (contracts.size === 1) {
        // Create a single-contract token-list token set

        const contract = contracts.keys().next().value;
        const tokenIds = tokens.map((t) => t.split(":")[1]);

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
      } else {
        // Create a multi-contract token-list token set

        // Map each `contract:tokenId` to a number by hashing
        const merkleTree = generateMerkleTree(
          tokens.map((t) => keccak256(["address", "uint256"], [t.split(":")[0], t.split(":")[1]]))
        );

        const ts = await tokenSet.mixedTokenList.save([
          {
            id: `list:${merkleTree.getHexRoot()}`,
            schemaHash: generateSchemaHash(undefined),
            items: {
              tokens,
            },
          },
        ]);

        if (ts.length !== 1) {
          throw Boom.internal("Could not save token set");
        }

        return { id: ts[0].id };
      }
    } catch (error) {
      logger.error(`post-token-sets-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
