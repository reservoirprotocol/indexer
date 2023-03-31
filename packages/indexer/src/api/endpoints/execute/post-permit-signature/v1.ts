import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import * as SeaportPermit from "@reservoir0x/sdk/dist/router/v6/permits/seaport";
import * as UniswapPermit from "@reservoir0x/sdk/dist/router/v6/permits/permit2";
import { baseProvider } from "@/common/provider";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as nft from "@/utils/permits/nft";
import * as ft from "@/utils/permits/ft";

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
      kind: Joi.string().valid("nft-permit", "ft-permit").required().description("Type of permit"),
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
      switch (payload.kind) {
        case "ft-permit":
          try {
            const permit = await ft.getPermit(payload.id);
            if (!permit) {
              throw Boom.badRequest("Permit does not exist");
            }

            // Attach the signature to the permit
            const orderData = permit.details.data as UniswapPermit.Data;
            orderData.signature = query.signature;

            // Verify the permit signature
            new UniswapPermit.Handler(config.chainId, baseProvider).attachAndCheckSignature(
              orderData,
              query.signature
            );

            // Update the cached permit to include the signature
            await ft.savePermit(payload.id, permit, 0);
          } catch {
            throw Boom.badRequest("Invalid permit signature");
          }
          break;

        case "nft-permit":
          try {
            const permit = await nft.getPermit(payload.id);
            if (!permit) {
              throw Boom.badRequest("Permit does not exist");
            }
            // Attach the signature to the permit
            const orderData = (permit.details.data as SeaportPermit.Data).order;
            orderData.signature = query.signature;

            // Verify the permit signature
            const order = new Sdk.SeaportV11.Order(config.chainId, orderData);
            await order.checkSignature();

            // Update the cached permit to include the signature
            await nft.savePermit(payload.id, permit, 0);
          } catch {
            throw Boom.badRequest("Invalid permit signature");
          }
          break;
      }

      return { message: "Success" };
    } catch (error) {
      logger.error(`post-permit-signature-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
