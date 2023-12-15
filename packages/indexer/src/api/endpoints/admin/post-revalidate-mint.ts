import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { config } from "@/config/index";
import { getCollectionMints, upsertCollectionMint } from "@/orderbook/mints";

export const postRevalidateMintOptions: RouteOptions = {
  description: "Revalidate an existing mint",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      collection: Joi.string().required(),
      stage: Joi.string().required(),
      tokenId: Joi.string().pattern(regex.token),
      status: Joi.string().valid("inactive").required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

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

      await upsertCollectionMint({
        ...collectionMints[0],
        status: "closed",
      });

      return { message: "Success" };
    } catch (error) {
      logger.error("post-revalidate-order-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
