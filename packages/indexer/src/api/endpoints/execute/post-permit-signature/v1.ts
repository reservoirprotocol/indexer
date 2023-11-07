import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import { PermitHandler } from "@reservoir0x/sdk/dist/router/v6/permit";
import Joi from "joi";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { getEphemeralPermit, saveEphemeralPermit, savePersistentPermit } from "@/utils/permits";

const version = "v1";

export const postPermitSignatureV1Options: RouteOptions = {
  description: "Attach a signature to an existing permit",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    query: Joi.object({
      signature: Joi.string().required().description("Signature to attach to the permit"),
    }),
    payload: Joi.object({
      id: Joi.string().required().description("Id of the permit"),
      persist: Joi.boolean().description("Whether to persist the permit or not"),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postPermitSignature${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-permit-signature-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      const id = payload.id;
      const persist = payload.persist;
      const signature = query.signature;

      const permit = await getEphemeralPermit(id);
      if (!permit) {
        throw Boom.badRequest("Permit does not exist");
      }

      // Attach the signature to the permit
      permit.data.signature = signature;

      // Verify the permit signature
      try {
        await new PermitHandler(config.chainId, baseProvider).attachAndCheckSignature(
          permit,
          signature
        );
      } catch {
        throw Boom.badRequest("Invalid permit signature");
      }

      // Update the cached permit to include the signature
      await saveEphemeralPermit(id, permit);

      // Persist the permit if needed
      if (persist) {
        await savePersistentPermit(permit, signature);
      }

      return { message: "Success" };
    } catch (error) {
      logger.error(`post-permit-signature-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
