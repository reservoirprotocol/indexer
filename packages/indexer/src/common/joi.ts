/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumberish } from "@ethersproject/bignumber";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { bn, formatEth, formatPrice, formatUsd, fromBuffer, now, regex } from "@/common/utils";
import { Currency, getCurrency } from "@/utils/currencies";
import { getUSDAndNativePrices } from "@/utils/prices";
import { Sources } from "@/models/sources";
import crypto from "crypto";
import { Assets } from "@/utils/assets";
import { config } from "@/config/index";

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

export const JoiDynamicPrice = Joi.alternatives(
  Joi.object({
    kind: "dutch",
    data: Joi.object({
      price: Joi.object({
        start: JoiPrice,
        end: JoiPrice,
      }),
      time: Joi.object({
        start: Joi.number(),
        end: Joi.number(),
      }),
    }),
  }),
  Joi.object({
    kind: "pool",
    data: Joi.object({
      pool: Joi.string(),
      prices: Joi.array().items(JoiPrice),
    }),
  })
);

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

export const getJoiDynamicPricingObject = async (
  dynamic: boolean,
  kind: string,
  normalizeRoyalties: boolean,
  raw_data:
    | Sdk.SeaportV14.Types.OrderComponents
    | Sdk.Sudoswap.OrderParams
    | Sdk.Nftx.Types.OrderParams,
  currency?: string,
  missing_royalties?: []
) => {
  const floorAskCurrency = currency ? currency : Sdk.Common.Addresses.Eth[config.chainId];

  // Add missing royalties on top of the raw prices
  const missingRoyalties = normalizeRoyalties
    ? ((missing_royalties ?? []) as any[])
        .map((mr: any) => bn(mr.amount))
        .reduce((a, b) => a.add(b), bn(0))
    : bn(0);

  if (dynamic && (kind === "seaport" || kind === "seaport-v1.4")) {
    const order = new Sdk.SeaportV14.Order(
      config.chainId,
      raw_data as Sdk.SeaportV14.Types.OrderComponents
    );

    // Dutch auction
    return {
      kind: "dutch",
      data: {
        price: {
          start: await getJoiPriceObject(
            {
              gross: {
                amount: bn(order.getMatchingPrice(order.params.startTime))
                  .add(missingRoyalties)
                  .toString(),
              },
            },
            floorAskCurrency
          ),
          end: await getJoiPriceObject(
            {
              gross: {
                amount: bn(order.getMatchingPrice(order.params.endTime))
                  .add(missingRoyalties)
                  .toString(),
              },
            },
            floorAskCurrency
          ),
        },
        time: {
          start: order.params.startTime,
          end: order.params.endTime,
        },
      },
    };
  } else if (kind === "sudoswap") {
    // Pool orders
    return {
      kind: "pool",
      data: {
        pool: (raw_data as Sdk.Sudoswap.OrderParams).pair,
        prices: await Promise.all(
          ((raw_data as Sdk.Sudoswap.OrderParams).extra.prices as string[]).map((price) =>
            getJoiPriceObject(
              {
                gross: {
                  amount: bn(price).add(missingRoyalties).toString(),
                },
              },
              floorAskCurrency
            )
          )
        ),
      },
    };
  } else if (kind === "nftx") {
    // Pool orders
    return {
      kind: "pool",
      data: {
        pool: (raw_data as Sdk.Nftx.Types.OrderParams).pool,
        prices: await Promise.all(
          ((raw_data as Sdk.Nftx.Types.OrderParams).extra.prices as string[]).map((price) =>
            getJoiPriceObject(
              {
                gross: {
                  amount: bn(price).add(missingRoyalties).toString(),
                },
              },
              floorAskCurrency
            )
          )
        ),
      },
    };
  }
};

// --- Sales ---

export const JoiFeeBreakdown = Joi.object({
  kind: Joi.string(),
  bps: Joi.number(),
  recipient: Joi.string(),
});

export const JoiSale = Joi.object({
  id: Joi.string(),
  saleId: Joi.string(),
  token: Joi.object({
    contract: Joi.string().lowercase().pattern(regex.address),
    tokenId: Joi.string().pattern(regex.number),
    name: Joi.string().allow("", null),
    image: Joi.string().allow("", null),
    collection: Joi.object({
      id: Joi.string().allow(null),
      name: Joi.string().allow("", null),
    }),
  }),
  orderSource: Joi.string().allow("", null),
  orderSide: Joi.string().valid("ask", "bid"),
  orderKind: Joi.string(),
  orderId: Joi.string().allow(null),
  from: Joi.string().lowercase().pattern(regex.address),
  to: Joi.string().lowercase().pattern(regex.address),
  amount: Joi.string(),
  fillSource: Joi.string().allow(null),
  block: Joi.number(),
  txHash: Joi.string().lowercase().pattern(regex.bytes32),
  logIndex: Joi.number(),
  batchIndex: Joi.number(),
  timestamp: Joi.number(),
  price: JoiPrice,
  washTradingScore: Joi.number(),
  royaltyFeeBps: Joi.number(),
  marketplaceFeeBps: Joi.number(),
  paidFullRoyalty: Joi.boolean(),
  feeBreakdown: Joi.array().items(JoiFeeBreakdown),
});

export const JoiLastSale = Joi.object({
  id: Joi.string().optional(),
  saleId: Joi.string().optional(),
  token: Joi.object({
    contract: Joi.string().lowercase().pattern(regex.address),
    tokenId: Joi.string().pattern(regex.number),
    name: Joi.string().allow("", null),
    image: Joi.string().allow("", null),
    collection: Joi.object({
      id: Joi.string().allow(null),
      name: Joi.string().allow("", null),
    }),
  }).optional(),
  orderSource: Joi.string().allow("", null).optional(),
  orderSide: Joi.string().valid("ask", "bid").optional(),
  orderKind: Joi.string().optional(),
  orderId: Joi.string().allow(null).optional(),
  from: Joi.string().lowercase().pattern(regex.address).optional(),
  to: Joi.string().lowercase().pattern(regex.address).optional(),
  amount: Joi.string().optional(),
  fillSource: Joi.string().allow(null).optional(),
  block: Joi.number().optional(),
  txHash: Joi.string().lowercase().pattern(regex.bytes32).optional(),
  logIndex: Joi.number().optional(),
  batchIndex: Joi.number().optional(),
  timestamp: Joi.number(),
  price: JoiPrice,
  washTradingScore: Joi.number().optional(),
  royaltyFeeBps: Joi.number().optional(),
  marketplaceFeeBps: Joi.number().optional(),
  paidFullRoyalty: Joi.boolean().optional(),
  feeBreakdown: Joi.array().items(JoiFeeBreakdown).optional(),
});

export const feeInfoIsValid = (
  royaltyFeeBps: number | undefined,
  marketplaceFeeBps: number | undefined
) => {
  return (royaltyFeeBps ?? 0) + (marketplaceFeeBps ?? 0) < 10000;
};

export const getFeeValue = (feeValue: any, validFees: boolean) => {
  return feeValue !== null && validFees ? feeValue : undefined;
};

export const getFeeBreakdown = (
  royaltyFeeBreakdown: any,
  marketplaceFeeBreakdown: any,
  validFees: boolean
) => {
  return (royaltyFeeBreakdown !== null || marketplaceFeeBreakdown !== null) && validFees
    ? [].concat(
        (royaltyFeeBreakdown ?? []).map((detail: any) => {
          return {
            kind: "royalty",
            ...detail,
          };
        }),
        (marketplaceFeeBreakdown ?? []).map((detail: any) => {
          return {
            kind: "marketplace",
            ...detail,
          };
        })
      )
    : undefined;
};

export const getJoiSaleObject = async (sale: {
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
  };
  fees: {
    royaltyFeeBps?: number;
    marketplaceFeeBps?: number;
    paidFullRoyalty?: boolean;
    royaltyFeeBreakdown?: any;
    marketplaceFeeBreakdown?: any;
  };
  currencyAddress: Buffer;
  timestamp: number;
  contract?: Buffer;
  tokenId?: string;
  name?: string;
  image?: string;
  collectionId?: string;
  collectionName?: string;
  washTradingScore?: number;
  orderId?: string;
  orderSourceId?: number;
  orderSide?: string;
  orderKind?: string;
  maker?: Buffer;
  taker?: Buffer;
  amount?: number;
  fillSourceId?: number;
  block?: number;
  txHash?: Buffer;
  logIndex?: number;
  batchIndex?: number;
}) => {
  const lastSaleFeeInfoIsValid = feeInfoIsValid(
    sale.fees.royaltyFeeBps,
    sale.fees.marketplaceFeeBps
  );
  const sources = await Sources.getInstance();
  const orderSource =
    sale.orderSourceId !== null && sale.orderSourceId !== undefined
      ? sources.get(Number(sale.orderSourceId))
      : undefined;
  const fillSource =
    sale.fillSourceId !== null && sale.fillSourceId !== undefined
      ? sources.get(Number(sale.fillSourceId))
      : undefined;

  return {
    id:
      sale.txHash &&
      crypto
        .createHash("sha256")
        .update(`${fromBuffer(sale.txHash)}${sale.logIndex}${sale.batchIndex}`)
        .digest("hex"),
    saleId:
      sale.txHash &&
      crypto
        .createHash("sha256")
        .update(
          `${fromBuffer(sale.txHash)}${sale.maker}${sale.taker}${sale.contract}${sale.tokenId}${
            sale.prices.gross.nativeAmount
          }`
        )
        .digest("hex"),
    token:
      sale.contract !== undefined && sale.tokenId !== undefined
        ? {
            contract: fromBuffer(sale.contract),
            tokenId: sale.tokenId,
            name: sale.name ?? null,
            image: sale.image ? Assets.getLocalAssetsLink(sale.image) : null,
            collection: {
              id: sale.collectionId ?? null,
              name: sale.collectionName ?? null,
            },
          }
        : undefined,
    orderId: sale.orderId,
    orderSource: orderSource?.domain ?? undefined,
    orderSide: sale.orderSide && (sale.orderSide === "sell" ? "ask" : "bid"),
    orderKind: sale.orderKind,
    from:
      sale.maker &&
      sale.taker &&
      (sale.orderSide === "sell" ? fromBuffer(sale.maker) : fromBuffer(sale.taker)),
    to:
      sale.maker &&
      sale.taker &&
      (sale.orderSide === "sell" ? fromBuffer(sale.taker) : fromBuffer(sale.maker)),
    amount: sale.amount,
    fillSource: fillSource?.domain ?? orderSource?.domain ?? undefined,
    block: sale.block,
    txHash: sale.txHash && fromBuffer(sale.txHash),
    logIndex: sale.logIndex,
    batchIndex: sale.batchIndex,
    timestamp: sale.timestamp,
    price: await getJoiPriceObject(
      {
        gross: {
          amount: sale.prices.gross.amount,
          nativeAmount: sale.prices.gross.nativeAmount,
          usdAmount: sale.prices.gross.usdAmount,
        },
      },
      fromBuffer(sale.currencyAddress),
      (sale.fees.royaltyFeeBps ?? 0) + (sale.fees.marketplaceFeeBps ?? 0)
    ),
    washTradingScore: sale.washTradingScore,
    royaltyFeeBps: getFeeValue(sale.fees.royaltyFeeBps, lastSaleFeeInfoIsValid),
    marketplaceFeeBps: getFeeValue(sale.fees.marketplaceFeeBps, lastSaleFeeInfoIsValid),
    paidFullRoyalty: getFeeValue(sale.fees.paidFullRoyalty, lastSaleFeeInfoIsValid),
    feeBreakdown: getFeeBreakdown(
      sale.fees.royaltyFeeBreakdown,
      sale.fees.marketplaceFeeBreakdown,
      lastSaleFeeInfoIsValid
    ),
  };
};
