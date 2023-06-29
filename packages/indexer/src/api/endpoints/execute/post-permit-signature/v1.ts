import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import { PermitHandler, PermitWithTransfers } from "@reservoir0x/sdk/dist/router/v6/permit";
import Joi from "joi";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { getPermit, savePermit } from "@/utils/permits";

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
      try {
        const permit = await getPermit(payload.id);
        if (!permit) {
          throw Boom.badRequest("Permit does not exist");
        }

        // Attach the signature to the permit
        const permitData = permit.data as PermitWithTransfers;
        permitData.signature = query.signature;

        // Verify the permit signature
        new PermitHandler(config.chainId, baseProvider).attachAndCheckSignature(
          permitData,
          query.signature
        );

        // Update the cached permit to include the signature
        await savePermit(payload.id, permit, 0);
      } catch {
        throw Boom.badRequest("Invalid permit signature");
      }

      return { message: "Success" };
    } catch (error) {
      logger.error(`post-permit-signature-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
