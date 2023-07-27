/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { formatPrice, now, regex, bn, formatUsd } from "@/common/utils";
import { getUSDAndCurrencyPrices } from "@/utils/prices";
import { getCurrency } from "@/utils/currencies";
import * as Boom from "@hapi/boom";

const version = "v1";

export const getCurrencyConversionV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 5000,
  },
  description: "Currency Conversions",
  notes: "Convert an amount in one currency to another",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      from: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Currency address to convert from"),
      to: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Currency address to convert to"),
    }),
  },
  response: {
    schema: Joi.object({
      conversion: Joi.string().optional(),
      usd: Joi.string().optional(),
    }).label(`getCurrencyConversion${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-currency-conversion-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const currencies = await Promise.allSettled([getCurrency(query.from), getCurrency(query.to)]);
      const fromCurrency = currencies[0].status === "fulfilled" ? currencies[0].value : undefined;
      const toCurrency = currencies[1].status === "fulfilled" ? currencies[1].value : undefined;

      if (!fromCurrency || !toCurrency) {
        throw Boom.badRequest(!fromCurrency ? "From currency missing" : "To currency missing");
      }

      const currentTime = now();
      const prices = await getUSDAndCurrencyPrices(
        query.from,
        query.to,
        `${bn(10).pow(fromCurrency.decimals!)}`,
        currentTime
      );
      const conversion: string | undefined = prices.currencyPrice
        ? `${formatPrice(prices.currencyPrice, toCurrency.decimals)}`
        : undefined;
      const usd: string | undefined = prices.usdPrice ? `${formatUsd(prices.usdPrice)}` : undefined;

      return {
        conversion,
        usd,
      };
    } catch (error) {
      logger.error(`get-currency-conversion-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
