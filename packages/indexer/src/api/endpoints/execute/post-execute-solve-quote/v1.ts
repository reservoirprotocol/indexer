import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { config } from "@/config/index";

const version = "v1";

export const postExecuteSolveQuoteV1Options: RouteOptions = {
  description: "Get the quote for a solver action",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    payload: Joi.alternatives(
      Joi.object({
        kind: Joi.string().valid("seaport-intent").required(),
        items: Joi.array()
          .items(
            Joi.object({
              token: Joi.string().pattern(regex.token).required(),
              quantity: Joi.number().default(1),
            })
          )
          .min(1)
          .required(),
      })
    ),
  },
  response: {
    schema: Joi.object({
      quote: {
        currency: Joi.string().pattern(regex.address).required(),
        amount: Joi.string().pattern(regex.number).required(),
      },
    }).label(`postExecuteSolveQuote${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `post-execute-solve-quote-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      const kind = payload.kind as "seaport-intent";

      switch (kind) {
        case "seaport-intent": {
          const items = payload.items as { token: string; quantity: number }[];
          if (items.length > 1) {
            throw Boom.notImplemented("Only single-item actions are supported");
          }

          if (!config.seaportSolverBaseUrl) {
            throw Boom.notImplemented("Action not supported");
          }

          const item = items[0];
          const { quote } = await axios
            .post(`${config.seaportSolverBaseUrl}/intents/quote`, {
              chainId: config.chainId,
              token: item.token,
              amount: item.quantity,
            })
            .then((response) => ({ quote: response.data.price }));

          return {
            quote: {
              currency: Sdk.Common.Addresses.Native[config.chainId],
              amount: quote,
            },
          };
        }
      }
    } catch (error) {
      logger.error(`post-execute-solve-quote-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
