import Joi from "joi";

import { formatEth, formatPrice, formatUsd, now, regex } from "@/common/utils";
import { Currency, getCurrency } from "@/utils/currencies";
import { getUSDAndNativePrices } from "@/utils/prices";

// --- Prices ---

const JoiPriceAmount = Joi.object({
  raw: Joi.string().pattern(regex.number),
  decimal: Joi.string(),
  usd: Joi.string().allow(null),
  native: Joi.string(),
});

const JoiPriceCurrency = Joi.object({
  contract: Joi.string().pattern(regex.address),
  name: Joi.string(),
  symbol: Joi.string(),
  decimals: Joi.number(),
});

export const JoiPrice = Joi.object({
  currency: JoiPriceCurrency,
  amount: JoiPriceAmount,
  netAmount: JoiPriceAmount.optional(),
});

export const getJoiAmountObject = async (
  currency: Currency,
  amount: string,
  nativeAmount: string,
  usdAmount?: string
) => {
  let usdPrice = usdAmount;
  if (amount && !usdPrice) {
    usdPrice = (
      await getUSDAndNativePrices(currency.contract, amount, now(), {
        onlyUSD: true,
      })
    ).usdPrice;
  }

  return {
    raw: amount,
    decimal: formatPrice(amount, currency.decimals),
    usd: usdPrice ? formatUsd(usdPrice) : null,
    native: formatEth(nativeAmount),
  };
};

export const getJoiPriceObject = async (
  prices: {
    gross: {
      amount: string;
      nativeAmount: string;
      usdAmount?: string;
    };
    net?: {
      amount: string;
      nativeAmount: string;
      usdAmount?: string;
    };
  },
  currencyAddress: string
) => {
  const currency = await getCurrency(currencyAddress);
  return {
    currency: {
      contract: currency.contract,
      name: currency.name,
      symbol: currency.symbol,
      decimals: currency.decimals,
    },
    amount: await getJoiAmountObject(
      currency,
      prices.gross.amount,
      prices.gross.nativeAmount,
      prices.gross.usdAmount
    ),
    netAmount:
      prices.net &&
      (await getJoiAmountObject(
        currency,
        prices.net.amount,
        prices.net.nativeAmount,
        prices.net.usdAmount
      )),
  };
};

// --- Order ---

export const JoiOrderMetadata = Joi.alternatives(
  Joi.object({
    kind: "token",
    data: Joi.object({
      collectionId: Joi.string().allow("", null),
      collectionName: Joi.string().allow("", null),
      tokenName: Joi.string().allow("", null),
      image: Joi.string().allow("", null),
    }),
  }),
  Joi.object({
    kind: "collection",
    data: Joi.object({
      collectionId: Joi.string().allow("", null),
      collectionName: Joi.string().allow("", null),
      image: Joi.string().allow("", null),
    }),
  }),
  Joi.object({
    kind: "attribute",
    data: Joi.object({
      collectionId: Joi.string().allow("", null),
      collectionName: Joi.string().allow("", null),
      attributes: Joi.array().items(Joi.object({ key: Joi.string(), value: Joi.string() })),
      image: Joi.string().allow("", null),
    }),
  })
);
