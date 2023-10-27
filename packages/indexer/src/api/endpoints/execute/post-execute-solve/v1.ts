import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import Joi from "joi";

import { config } from "@/config/index";
import { logger } from "@/common/logger";

const version = "v1";

export const postExecuteSolveV1Options: RouteOptions = {
  description: "Indirectly fill an order via a relayer",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    payload: Joi.alternatives(
      Joi.object({
        kind: Joi.string().valid("seaport-v1.5-intent").required(),
        order: Joi.any().required(),
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
    const payload = request.payload as any;

    try {
      switch (payload.kind) {
        case "seaport-v1.5-intent": {
          const order = new Sdk.SeaportV15.Order(config.chainId, payload.order);

          await axios
            .post(`${config.solverBaseUrl}/intents/seaport`, { order: payload.order })
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
