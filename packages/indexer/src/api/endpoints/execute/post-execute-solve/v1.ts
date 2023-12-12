import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";

const version = "v1";

export const postExecuteSolveV1Options: RouteOptions = {
  description: "Indirectly fill an order via a solver",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    query: Joi.object({
      signature: Joi.string().description("Signature for the solve request"),
    }),
    payload: Joi.alternatives(
      Joi.object({
        kind: Joi.string().valid("seaport-intent").required(),
        order: Joi.any().required(),
      }),
      Joi.object({
        kind: Joi.string().valid("cross-chain-intent").required(),
        request: Joi.any().required(),
      })
    ),
  },
  response: {
    schema: Joi.object({
      status: Joi.object({
        endpoint: Joi.string().required(),
        method: Joi.string().valid("POST").required(),
        body: Joi.any(),
      }),
    }).label(`postExecuteSolve${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-execute-solve-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = request.query as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      switch (payload.kind) {
        case "cross-chain-intent": {
          const response = await axios
            .post(`${config.crossChainSolverBaseUrl}/intents/trigger`, {
              request: payload.request,
              signature: query.signature,
            })
            .then((response) => response.data);

          return {
            status: {
              endpoint: "/execute/status/v1",
              method: "POST",
              body: {
                kind: payload.kind,
                id: response.requestId,
              },
            },
          };
        }

        case "seaport-intent": {
          const order = new Sdk.SeaportV15.Order(config.chainId, {
            ...payload.order,
            signature: payload.order.signature ?? query.signature,
          });

          await axios.post(`${config.seaportSolverBaseUrl}/intents/trigger`, {
            chainId: config.chainId,
            order: order.params,
          });

          return {
            status: {
              endpoint: "/execute/status/v1",
              method: "POST",
              body: {
                kind: payload.kind,
                id: order.hash(),
              },
            },
          };
        }

        default: {
          throw Boom.badRequest("Unknown kind");
        }
      }
    } catch (error) {
      logger.error(`post-execute-solve-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
