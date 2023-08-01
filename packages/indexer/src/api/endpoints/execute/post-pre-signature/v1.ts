import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import { checkEIP721Signature } from "@reservoir0x/sdk/dist/utils";
import Joi from "joi";

import { logger } from "@/common/logger";
import { getPreSignature, savePreSignature } from "@/utils/pre-signatures";

const version = "v1";

export const postPreSignatureV1Options: RouteOptions = {
  description: "Attach a signature to an existing pre-signature",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    query: Joi.object({
      signature: Joi.string().required().description("Signature to attach to the pre-signature"),
    }),
    payload: Joi.object({
      id: Joi.string().required().description("Id of the pre-signature"),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postPreSignature${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-pre-signature-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;
    try {
      const preSignature = await getPreSignature(payload.id);
      if (!preSignature) {
        throw Boom.badRequest("Pre-signature does not exist");
      }

      switch (preSignature.kind) {
        case "payment-processor-take-order": {
          // Attach the signature to the pre-signature
          preSignature.signature = query.signature;

          const signatureValid = checkEIP721Signature(
            preSignature.data,
            query.signature,
            preSignature.signer
          );
          if (!signatureValid) {
            throw new Error("Invalid signature");
          }

          // Update the cached pre-signature to include the signature
          await savePreSignature(payload.id, preSignature, 0);

          break;
        }

        default: {
          throw new Error("Unknown pre-signature kind");
        }
      }

      return { message: "Success" };
    } catch (error) {
      logger.error(`post-pre-signature-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
