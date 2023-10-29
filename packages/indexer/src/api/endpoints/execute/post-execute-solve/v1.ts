import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import Joi from "joi";

import { config } from "@/config/index";
import { logger } from "@/common/logger";

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
        order: Joi.any().required(),
        fromChainId: Joi.number().required(),
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
          const order = new Sdk.CrossChain.Order(payload.fromChainId, {
            ...payload.order,
            signature: payload.order.signature ?? query.signature,
          });

          await axios
            .post(`${config.crossChainSolverBaseUrl}/trigger`, {
              chainId: payload.fromChainId,
              order: order.params,
            })
            .then((response) => response.data);

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

        case "seaport-intent": {
          const order = new Sdk.SeaportV15.Order(config.chainId, {
            ...payload.order,
            signature: payload.order.signature ?? query.signature,
          });

          await axios
            .post(`${config.seaportSolverBaseUrl}/trigger`, {
              chainId: config.chainId,
              order: order.params,
            })
            .then((response) => response.data);

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
