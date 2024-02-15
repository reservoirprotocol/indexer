/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { formatPrice, now, regex, bn, formatUsd } from "@/common/utils";
import { getAvailableUSDPrice, getUSDAndCurrencyPrices } from "@/utils/prices";
import { getCurrency } from "@/utils/currencies";
import * as Boom from "@hapi/boom";
import { redis } from "@/common/redis";

const version = "v1";

export const getCurrencyConversionV1Options: RouteOptions = {
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
      from: Joi.string().lowercase().description("Currency address or fiat symbol to convert from"),
      to: Joi.string().lowercase().description("Currency address or fiat symbol to convert to"),
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

    let cacheKey = "";

    if (request.raw.req.url) {
      cacheKey = request.raw.req.url;
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return JSON.parse(cachedData);
      }
    }

    try {
      let conversion: string | undefined;
      let usd: string | undefined;
      const currentTime = now();

      if (query.from.match(regex.address) && query.to.match(regex.address)) {
        const currencies = await Promise.allSettled([
          getCurrency(query.from),
          getCurrency(query.to),
        ]);
        const fromCurrency = currencies[0].status === "fulfilled" ? currencies[0].value : undefined;
        const toCurrency = currencies[1].status === "fulfilled" ? currencies[1].value : undefined;

        if (!fromCurrency || !toCurrency) {
          throw Boom.badRequest(!fromCurrency ? "From currency missing" : "To currency missing");
        }
        const price = `${bn(10).pow(fromCurrency.decimals!)}`;
        const prices = await getUSDAndCurrencyPrices(query.from, query.to, price, currentTime);
        conversion = prices.currencyPrice
          ? `${formatPrice(prices.currencyPrice, toCurrency.decimals)}`
          : undefined;
        usd = prices.usdPrice;
      } else {
        if (query.from !== "usd" && query.to !== "usd") {
          throw Boom.badRequest("Fiat currency not supported");
        }
        const cryptoCurrency = query.from.match(regex.address) ? query.from : query.to;
        const currency = await getCurrency(cryptoCurrency);
        const currencyUSDPrice = await getAvailableUSDPrice(cryptoCurrency, currentTime, false);
        usd = currencyUSDPrice?.value || "0";
        const currencyUnit = bn(10).pow(currency.decimals!);
        const usdUnit = bn(10).pow(6);
        const usdToEthereumWei = usdUnit.mul(currencyUnit).div(usd);
        conversion =
          query.to === currency.contract
            ? `${formatPrice(usdToEthereumWei, currency.decimals)}`
            : `${formatUsd(usd)}`;
      }

      const response = {
        conversion,
        usd: usd ? `${formatUsd(usd)}` : undefined,
      };

      if (cacheKey) {
        await redis.set(cacheKey, JSON.stringify(response), "EX", 60 * 60);
      }

      return response;
    } catch (error) {
      logger.error(`get-currency-conversion-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
