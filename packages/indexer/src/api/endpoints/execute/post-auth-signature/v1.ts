import { verifyMessage } from "@ethersproject/wallet";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import axios from "axios";
import Joi from "joi";

import { logger } from "@/common/logger";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import * as b from "@/utils/auth/blur";
import * as e from "@/utils/auth/erc721c";
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
      kind: Joi.string().valid("blur", "erc721c", "opensea").required().description("Type of auth"),
      id: Joi.string().required().description("Id of the auth challenge"),
    }),
  },
  response: {
    schema: Joi.object({
      auth: Joi.string(),
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

          const result = await axios
            .get(
              `${config.orderFetcherBaseUrl}/api/blur-auth?authChallenge=${JSON.stringify({
                ...authChallenge,
                signature: query.signature,
              })}`
            )
            .then((response) => response.data);

          const authId = b.getAuthId(recoveredSigner);
          await b.saveAuth(
            authId,
            { accessToken: result.accessToken },
            // Give a 1 minute buffer for the auth to expire
            Number(
              JSON.parse(Buffer.from(result.accessToken.split(".")[1], "base64").toString()).exp
            ) -
              now() -
              60
          );

          return { auth: await b.getAuth(authId).then((a) => a?.accessToken) };
        }

        case "erc721c": {
          const authChallenge = await e.getAuthChallenge(payload.id);
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

          const authId = e.getAuthId(recoveredSigner);
          await e.saveAuth(
            authId,
            { signature: query.signature },
            // Give a 10 minute buffer for the auth to expire
            10 * 60
          );

          return { auth: await e.getAuth(authId).then((a) => a?.signature) };
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
              `${config.orderFetcherBaseUrl}/api/opensea-auth?chainId=${config.chainId}&taker=${authChallenge.walletAddress}&loginMessage=${authChallenge.loginMessage}&signature=${query.signature}`
            )
            .then((response) => response.data.authorization);

          const authId = o.getAuthId(recoveredSigner);
          await o.saveAuth(
            authId,
            { authorization },
            // Give a 1 minute buffer for the auth to expire
            24 * 59 * 60
          );

          return { auth: await o.getAuth(authId).then((a) => a?.authorization) };
        }
      }
    } catch (error) {
      logger.error(`post-auth-signature-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
