import { verifyMessage } from "@ethersproject/wallet";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import axios from "axios";
import Joi from "joi";

import { logger } from "@/common/logger";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import * as b from "@/utils/auth/blur";
import * as o from "@/utils/auth/opensea";

const version = "v1";

export const postAuthSignatureV1Options: RouteOptions = {
  description: "Attach a signature to an existing auth challenge",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    query: Joi.object({
      signature: Joi.string().required().description("Signature to attach to the auth challenge"),
    }),
    payload: Joi.object({
      kind: Joi.string().valid("blur", "opensea").required().description("Type of permit"),
      id: Joi.string().required().description("Id of the auth challenge"),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postAuthSignature${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-auth-signature-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      switch (payload.kind) {
        case "blur": {
          const authChallenge = await b.getAuthChallenge(payload.id);
          if (!authChallenge) {
            throw Boom.badRequest("Auth challenge does not exist");
          }

          const recoveredSigner = verifyMessage(
            authChallenge.message,
            query.signature
          ).toLowerCase();
          if (recoveredSigner !== authChallenge.walletAddress.toLowerCase()) {
            throw Boom.badRequest("Invalid auth challenge signature");
          }

          const accessToken = await axios
            .get(
              `https://order-fetcher.vercel.app/api/blur-auth?authChallenge=${JSON.stringify({
                ...authChallenge,
                signature: query.signature,
              })}`,
              {
                headers: {
                  "X-Api-Key": config.orderFetcherApiKey,
                },
              }
            )
            .then((response) => response.data.accessToken);

          const authId = b.getAuthId(recoveredSigner);
          await b.saveAuth(
            authId,
            { accessToken },
            // Give a 1 minute buffer for the auth to expire
            Number(JSON.parse(Buffer.from(accessToken.split(".")[1], "base64").toString()).exp) -
              now() -
              60
          );

          break;
        }

        case "opensea": {
          const authChallenge = await o.getAuthChallenge(payload.id);
          if (!authChallenge) {
            throw Boom.badRequest("Auth challenge does not exist");
          }

          const recoveredSigner = verifyMessage(
            authChallenge.loginMessage,
            query.signature
          ).toLowerCase();
          if (recoveredSigner !== authChallenge.walletAddress.toLowerCase()) {
            throw Boom.badRequest("Invalid auth challenge signature");
          }

          const authorization = await axios
            .get(
              `https://order-fetcher.vercel.app/api/opensea-auth?chainId=${config.chainId}&taker=${authChallenge.walletAddress}&loginMessage=${authChallenge.loginMessage}&signature=${query.signature}`,
              {
                headers: {
                  "X-Api-Key": config.orderFetcherApiKey,
                },
              }
            )
            .then((response) => response.data.authorization);

          const authId = o.getAuthId(recoveredSigner);
          await o.saveAuth(
            authId,
            { authorization },
            // Give a 1 minute buffer for the auth to expire
            24 * 59 * 60
          );

          break;
        }
      }

      return { message: "Success" };
    } catch (error) {
      logger.error(`post-auth-signature-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
