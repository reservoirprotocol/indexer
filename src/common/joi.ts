import { BigNumberish } from "@ethersproject/bignumber";
import Joi from "joi";

import { bn, formatEth, formatPrice, formatUsd, now, regex } from "@/common/utils";
import { Currency, getCurrency } from "@/utils/currencies";
import { getUSDAndNativePrices } from "@/utils/prices";

// --- Prices ---

const JoiPriceAmount = Joi.object({
  raw: Joi.string().pattern(regex.number),
  decimal: Joi.number().unsafe(),
  usd: Joi.number().unsafe().allow(null),
  native: Joi.number().unsafe().allow(null),
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

const subFeeWithBps = (amount: BigNumberish, totalFeeBps: number) => {
  return bn(amount).sub(bn(amount).mul(totalFeeBps).div(10000)).toString();
};

export const getJoiAmountObject = async (
  currency: Currency,
  amount: string,
  nativeAmount?: string,
  usdAmount?: string,
  totalFeeBps?: number
) => {
  let usdPrice = usdAmount;
  if (amount && !usdPrice) {
    usdPrice = (
      await getUSDAndNativePrices(currency.contract, amount, now(), {
        onlyUSD: true,
        acceptStalePrice: true,
      })
    ).usdPrice;
  }

  if (totalFeeBps) {
    amount = subFeeWithBps(amount, totalFeeBps);
    if (usdPrice) {
      usdPrice = subFeeWithBps(usdPrice, totalFeeBps);
    }
    if (nativeAmount) nativeAmount = subFeeWithBps(nativeAmount, totalFeeBps);
  }

  return {
    raw: amount,
    decimal: formatPrice(amount, currency.decimals),
    usd: usdPrice ? formatUsd(usdPrice) : null,
    native: nativeAmount ? formatEth(nativeAmount) : null,
  };
};

export const getJoiPriceObject = async (
  prices: {
    gross: {
      amount: string;
      nativeAmount?: string;
      usdAmount?: string;
    };
    net?: {
      amount: string;
      nativeAmount?: string;
      usdAmount?: string;
    };
  },
  currencyAddress: string,
  totalFeeBps?: number
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
    netAmount: prices.net
      ? await getJoiAmountObject(
          currency,
          prices.net.amount,
          prices.net.nativeAmount,
          prices.net.usdAmount
        )
      : totalFeeBps && totalFeeBps < 10000
      ? await getJoiAmountObject(
          currency,
          prices.gross.amount,
          prices.gross.nativeAmount,
          prices.gross.usdAmount,
          totalFeeBps
        )
      : undefined,
  };
};

// --- Orders ---

export const JoiAttributeValue = Joi.string().required().allow("");
export const JoiAttributeKeyValueObject = Joi.object({
  key: Joi.string(),
  value: JoiAttributeValue,
});

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
      attributes: Joi.array().items(JoiAttributeKeyValueObject),
      image: Joi.string().allow("", null),
    }),
  })
);

export const JoiOrderCriteriaCollection = Joi.object({
  id: Joi.string().allow("", null),
  name: Joi.string().allow("", null),
  image: Joi.string().allow("", null),
});

export const JoiOrderCriteria = Joi.alternatives(
  Joi.object({
    kind: "token",
    data: Joi.object({
      token: Joi.object({
        tokenId: Joi.string().pattern(regex.number),
        name: Joi.string().allow("", null),
        image: Joi.string().allow("", null),
      }),
      collection: JoiOrderCriteriaCollection,
    }),
  }),
  Joi.object({
    kind: "collection",
    data: Joi.object({
      collection: JoiOrderCriteriaCollection,
    }),
  }),
  Joi.object({
    kind: "attribute",
    data: Joi.object({
      collection: JoiOrderCriteriaCollection,
      attribute: JoiAttributeKeyValueObject,
    }),
  }),
  Joi.object({
    kind: "custom",
  })
);
