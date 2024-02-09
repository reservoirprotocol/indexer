/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { getCurrency } from "@/utils/currencies";
import * as Boom from "@hapi/boom";

const version = "v1";

export const getRedirectCurrencyIconV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60000,
  },
  description: "Redirect response to the given currency address icon",
  tags: ["api", "Redirects"],
  plugins: {
    "hapi-swagger": {
      order: 53,
    },
  },
  validate: {
    params: Joi.object({
      address: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .required()
        .description(
          "Redirect to the given currency address icon. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
  },
  handler: async (request: Request, response) => {
    const params = request.params as any;

    try {
      const currency = await getCurrency(params.address);
      const currencyIconImage = currency?.metadata?.image;
      if (currencyIconImage) {
        return response
          .redirect(currencyIconImage)
          .header("cache-control", `max-age=60, must-revalidate, public`);
      }
    } catch (error) {
      logger.error(`get-redirect-currency-icon-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }

    throw Boom.notFound(`Currency address ${params.address} not found`);
  },
};
