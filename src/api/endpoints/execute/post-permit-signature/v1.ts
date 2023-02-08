import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import * as SeaportPermit from "@reservoir0x/sdk/dist/router/v6/permits/seaport";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { getPermit, savePermit } from "@/utils/permits/nft";

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
      kind: Joi.string().valid("nft-permit").required().description("Type of permit"),
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
      const permit = await getPermit(payload.id);
      if (!permit) {
        throw Boom.badRequest("Permit does not exist");
      }

      try {
        // Attach the signature to the permit
        const orderData = (permit.details.data as SeaportPermit.Data).order;
        orderData.signature = query.signature;

        // Verify the permit signature
        const order = new Sdk.Seaport.Order(config.chainId, orderData);
        await order.checkSignature();

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
