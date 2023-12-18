import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { getCollectionMints, simulateAndUpsertCollectionMint } from "@/orderbook/mints";

const version = "v1";

export const postSimulateMintV1Options: RouteOptions = {
  description: "Simulate any given mint",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  validate: {
    payload: Joi.object({
      collection: Joi.string().lowercase().required(),
      stage: Joi.string().lowercase().required(),
      tokenId: Joi.string().pattern(regex.address),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postSimulateMint${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-simulate-mint-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      const collection = payload.collection as string;
      const stage = payload.stage as string;
      const tokenId = payload.tokenId as string | undefined;

      const collectionMints = await getCollectionMints(collection, {
        stage,
        tokenId,
      });

      if (!collectionMints.length) {
        return { message: "No matching mints" };
      }
      if (collectionMints.length > 1) {
        return { message: "More than one matching mint" };
      }

      const result = await simulateAndUpsertCollectionMint(collectionMints[0]);
      return { message: `Mint is ${result ? "active" : "inactive"}` };
    } catch (error) {
      logger.error(`post-simulate-mint-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
