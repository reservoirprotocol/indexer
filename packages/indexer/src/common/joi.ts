/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumberish } from "@ethersproject/bignumber";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { bn, formatEth, formatPrice, formatUsd, fromBuffer, now, regex } from "@/common/utils";
import { Currency, getCurrency } from "@/utils/currencies";
import { getUSDAndCurrencyPrices, getUSDAndNativePrices } from "@/utils/prices";
import { Sources } from "@/models/sources";
import crypto from "crypto";
import { Assets } from "@/utils/assets";
import { config } from "@/config/index";
import { SourcesEntity } from "@/models/sources/sources-entity";

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
  displayCurrency?: string,
  totalFeeBps?: number
) => {
  let currency;

  if (displayCurrency) {
    const currentTime = now();
    currency = await getCurrency(displayCurrency);

    // Convert gross price
    const convertedGrossPrice = await getUSDAndCurrencyPrices(
      currencyAddress,
      displayCurrency,
      prices.gross.amount,
      currentTime
    );

    if (convertedGrossPrice.currencyPrice) {
      prices.gross.amount = convertedGrossPrice.currencyPrice;
    }

    // Convert net price
    if (prices.net?.amount) {
      const convertedNetPrice = await getUSDAndCurrencyPrices(
        currencyAddress,
        displayCurrency,
        prices.net.amount,
        currentTime
      );

      if (convertedNetPrice.currencyPrice) {
        prices.net.amount = convertedNetPrice.currencyPrice;
      }
    }
  } else {
    currency = await getCurrency(currencyAddress);
  }

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

export const JoiOrder = Joi.object({
  id: Joi.string().required(),
  kind: Joi.string().required(),
  side: Joi.string().valid("buy", "sell").required(),
  status: Joi.string(),
  tokenSetId: Joi.string().required(),
  tokenSetSchemaHash: Joi.string().lowercase().pattern(regex.bytes32).required(),
  contract: Joi.string().lowercase().pattern(regex.address),
  maker: Joi.string().lowercase().pattern(regex.address).required(),
  taker: Joi.string().lowercase().pattern(regex.address).required(),
  price: JoiPrice,
  validFrom: Joi.number().required(),
  validUntil: Joi.number().required(),
  quantityFilled: Joi.number().unsafe(),
  quantityRemaining: Joi.number().unsafe(),
  dynamicPricing: JoiDynamicPrice.allow(null),
  criteria: JoiOrderCriteria.allow(null),
  source: Joi.object().allow(null),
  feeBps: Joi.number().allow(null),
  feeBreakdown: Joi.array()
    .items(
      Joi.object({
        kind: Joi.string(),
        recipient: Joi.string().allow("", null),
        bps: Joi.number(),
      })
    )
    .allow(null),
  expiration: Joi.number().required(),
  isReservoir: Joi.boolean().allow(null),
  isDynamic: Joi.boolean(),
  createdAt: Joi.string().required(),
  updatedAt: Joi.string().required(),
  rawData: Joi.object().optional().allow(null),
});

export const JoiActivityOrder = Joi.object({
  id: Joi.string().allow(null),
  side: Joi.string().valid("ask", "bid").allow(null),
  source: Joi.object().allow(null),
  criteria: JoiOrderCriteria.allow(null),
});

export const getJoiDynamicPricingObject = async (
  dynamic: boolean,
  kind: string,
  normalizeRoyalties: boolean,
  raw_data:
    | Sdk.SeaportBase.Types.OrderComponents
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
      raw_data as Sdk.SeaportBase.Types.OrderComponents
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

export const getJoiOrderObject = async (order: {
  id: string;
  kind: string;
  side: string;
  status: string;
  tokenSetId: string;
  tokenSetSchemaHash: Buffer;
  contract: Buffer;
  maker: Buffer;
  taker: Buffer;
  prices: {
    gross: {
      amount: string;
      nativeAmount?: string;
      usdAmount?: string;
    };
    net: {
      amount: string;
      nativeAmount?: string;
      usdAmount?: string;
    };
    currency: Buffer;
  };
  validFrom: string;
  validUntil: string;
  quantityFilled: string;
  quantityRemaining: string;
  criteria: string;
  sourceIdInt: number;
  feeBps: any;
  feeBreakdown: any;
  expiration: string;
  isReservoir: boolean;
  createdAt: number;
  updatedAt: number;
  includeRawData: boolean;
  rawData:
    | Sdk.SeaportBase.Types.OrderComponents
    | Sdk.Sudoswap.OrderParams
    | Sdk.Nftx.Types.OrderParams;
  normalizeRoyalties: boolean;
  missingRoyalties: any;
  dynamic?: boolean;
  token?: string;
}) => {
  const sources = await Sources.getInstance();
  let source: SourcesEntity | undefined;
  if (order.tokenSetId?.startsWith("token")) {
    const [, contract, tokenId] = order.tokenSetId.split(":");
    source = sources.get(Number(order.sourceIdInt), contract, tokenId);
  } else if (order.token) {
    const [contract, tokenId] = order.token.split(":");
    source = sources.get(Number(order.sourceIdInt), contract, tokenId);
  } else {
    source = sources.get(Number(order.sourceIdInt));
  }

  const feeBreakdown = order.feeBreakdown;
  let feeBps = order.feeBps;

  if (order.normalizeRoyalties && order.missingRoyalties) {
    for (let i = 0; i < order.missingRoyalties.length; i++) {
      const index: number = order.feeBreakdown.findIndex(
        (fee: { recipient: string }) => fee.recipient === order.missingRoyalties[i].recipient
      );

      const missingFeeBps = Number(order.missingRoyalties[i].bps);
      feeBps += missingFeeBps;

      if (index !== -1) {
        feeBreakdown[index].bps += missingFeeBps;
      } else {
        feeBreakdown.push({
          bps: missingFeeBps,
          kind: "royalty",
          recipient: order.missingRoyalties[i].recipient,
        });
      }
    }
  }

  return {
    id: order.id,
    kind: order.kind,
    side: order.side,
    status: order.status,
    tokenSetId: order.tokenSetId,
    tokenSetSchemaHash: fromBuffer(order.tokenSetSchemaHash),
    contract: fromBuffer(order.contract),
    maker: fromBuffer(order.maker),
    taker: fromBuffer(order.taker),
    price: await getJoiPriceObject(
      {
        gross: {
          amount: order.prices.gross.amount,
          nativeAmount: order.prices.gross.nativeAmount,
        },
        net: {
          amount: order.prices.net.amount,
          nativeAmount: order.prices.net.nativeAmount,
        },
      },
      order.prices.currency
        ? fromBuffer(order.prices.currency)
        : order.side === "sell"
        ? Sdk.Common.Addresses.Eth[config.chainId]
        : Sdk.Common.Addresses.Weth[config.chainId]
    ),
    validFrom: Number(order.validFrom),
    validUntil: Number(order.validUntil),
    quantityFilled: Number(order.quantityFilled),
    quantityRemaining: Number(order.quantityRemaining),
    dynamicPricing: order.dynamic
      ? await getJoiDynamicPricingObject(
          order.dynamic,
          order.kind,
          order.normalizeRoyalties,
          order.rawData,
          order.prices.currency ? fromBuffer(order.prices.currency) : undefined,
          order.missingRoyalties ? order.missingRoyalties : undefined
        )
      : order.dynamic !== undefined
      ? null
      : undefined,
    criteria: order.criteria,
    source: {
      id: source?.address,
      domain: source?.domain,
      name: source?.getTitle(),
      icon: source?.getIcon(),
      url: source?.metadata.url,
    },
    feeBps: Number(feeBps.toString()),
    feeBreakdown: feeBreakdown,
    expiration: Number(order.expiration),
    isReservoir: order.isReservoir,
    isDynamic:
      order.dynamic !== undefined ? Boolean(order.dynamic || order.kind === "sudoswap") : undefined,
    createdAt: new Date(order.createdAt * 1000).toISOString(),
    updatedAt: new Date(order.updatedAt).toISOString(),
    rawData: order.includeRawData ? order.rawData : undefined,
  };
};

export const getJoiActivityOrderObject = async (order: {
  id: string | null;
  side: string | null;
  sourceIdInt: number | null | undefined;
  criteria: Record<string, unknown> | null;
}) => {
  const sources = await Sources.getInstance();
  const orderSource = order.sourceIdInt ? sources.get(order.sourceIdInt) : undefined;

  return {
    id: order.id,
    side: order.side ? (order.side === "sell" ? "ask" : "bid") : undefined,
    source: orderSource
      ? {
          domain: orderSource?.domain,
          name: orderSource?.getTitle(),
          icon: orderSource?.getIcon(),
        }
      : undefined,
    criteria: order.criteria,
  };
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
  isDeleted: Joi.boolean().optional(),
  createdAt: Joi.string().optional(),
  updatedAt: Joi.string().optional(),
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
  isDeleted?: boolean;
  updatedAt?: string;
  createdAt?: string;
}) => {
  const currency = await getCurrency(fromBuffer(sale.currencyAddress));
  const lastSaleFeeInfoIsValid = feeInfoIsValid(
    sale.fees.royaltyFeeBps,
    sale.fees.marketplaceFeeBps
  );
  const sources = await Sources.getInstance();
  const orderSource =
    sale.orderSourceId !== null ? sources.get(Number(sale.orderSourceId)) : undefined;
  const fillSource =
    sale.fillSourceId !== null ? sources.get(Number(sale.fillSourceId)) : undefined;
  const totalFeeBps = (sale.fees.royaltyFeeBps ?? 0) + (sale.fees.marketplaceFeeBps ?? 0);

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
    orderSource: orderSource?.domain ?? null,
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
    fillSource: fillSource?.domain ?? orderSource?.domain ?? null,
    block: sale.block,
    txHash: sale.txHash && fromBuffer(sale.txHash),
    logIndex: sale.logIndex,
    batchIndex: sale.batchIndex,
    timestamp: sale.timestamp,
    price: {
      currency: {
        contract: currency.contract,
        name: currency.name,
        symbol: currency.symbol,
        decimals: currency.decimals,
      },
      amount: await getJoiAmountObject(
        currency,
        sale.prices.gross.amount,
        sale.prices.gross.nativeAmount,
        sale.prices.gross.usdAmount
      ),
      netAmount: sale.prices.net
        ? await getJoiAmountObject(
            currency,
            sale.prices.net.amount,
            sale.prices.net.nativeAmount,
            sale.prices.net.usdAmount
          )
        : totalFeeBps && totalFeeBps < 10000
        ? await getJoiAmountObject(
            currency,
            sale.prices.gross.amount,
            sale.prices.gross.nativeAmount,
            sale.prices.gross.usdAmount,
            totalFeeBps
          )
        : undefined,
    },
    washTradingScore: sale.washTradingScore,
    royaltyFeeBps: getFeeValue(sale.fees.royaltyFeeBps, lastSaleFeeInfoIsValid),
    marketplaceFeeBps: getFeeValue(sale.fees.marketplaceFeeBps, lastSaleFeeInfoIsValid),
    paidFullRoyalty: getFeeValue(sale.fees.paidFullRoyalty, lastSaleFeeInfoIsValid),
    feeBreakdown: getFeeBreakdown(
      sale.fees.royaltyFeeBreakdown,
      sale.fees.marketplaceFeeBreakdown,
      lastSaleFeeInfoIsValid
    ),
    isDeleted: sale.isDeleted,
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
  };
};
