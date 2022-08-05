import { AddressZero } from "@ethersproject/constants";
import { parseUnits } from "@ethersproject/units";
import axios from "axios";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, toBuffer } from "@/common/utils";
import { getCurrency } from "@/utils/currencies";

const USD_DECIMALS = 6;
// TODO: This should be a per-network setting
const NATIVE_UNIT = bn("1000000000000000000");

export type Price = {
  currency: string;
  timestamp: number;
  value: string;
};

const getUpstreamUSDPrice = async (
  currencyAddress: string,
  timestamp: number
): Promise<Price | undefined> => {
  try {
    const currency = await getCurrency(currencyAddress);
    const coingeckoCurrencyId = currency?.metadata?.coingeckoCurrencyId;
    if (coingeckoCurrencyId) {
      const date = new Date(timestamp * 1000);
      const day = date.getDay();
      const month = date.getMonth() + 1;
      const year = date.getFullYear();

      const result: {
        market_data: {
          current_price: { [symbol: string]: number };
        };
      } = await axios
        .get(
          `https://api.coingecko.com/api/v3/coins/${coingeckoCurrencyId}/history?date=${day}-${month}-${year}`,
          { timeout: 10 * 1000 }
        )
        .then((response) => response.data);

      const usdPrice = result?.market_data?.current_price?.["usd"];
      if (usdPrice) {
        const value = parseUnits(usdPrice.toFixed(USD_DECIMALS), USD_DECIMALS).toString();
        const truncatedTimestamp = Math.floor(date.valueOf() / 1000);

        await idb.none(
          `
            INSERT INTO usd_prices (
              currency,
              timestamp,
              value
            ) VALUES (
              $/currency/,
              date_trunc('day', to_timestamp($/timestamp/)),
              $/value/
            ) ON CONFLICT DO NOTHING
          `,
          {
            currency: toBuffer(currencyAddress),
            timestamp: truncatedTimestamp,
            value,
          }
        );

        return {
          currency: currencyAddress,
          timestamp: truncatedTimestamp,
          value,
        };
      }
    }
  } catch (error) {
    logger.error("prices", `Failed to fetch upstream USD price for ${currencyAddress}: ${error}`);
  }

  return undefined;
};

const getCachedUSDPrice = async (
  currencyAddress: string,
  timestamp: number
): Promise<Price | undefined> =>
  idb
    .oneOrNone(
      `
        SELECT
          extract('epoch' from usd_prices.timestamp) AS "timestamp",
          usd_prices.value
        FROM usd_prices
        WHERE usd_prices.currency = $/currency/
          AND usd_prices.timestamp <= date_trunc('day', to_timestamp($/timestamp/))
        ORDER BY usd_prices.timestamp DESC
        LIMIT 1
      `,
      {
        currency: toBuffer(currencyAddress),
        timestamp,
      }
    )
    .then((data) =>
      data
        ? {
            currency: currencyAddress,
            timestamp: data.timestamp,
            value: data.value,
          }
        : undefined
    )
    .catch(() => undefined);

const getAvailableUSDPrice = async (currencyAddress: string, timestamp: number) => {
  // At the moment, we support day-level granularity for prices
  const DAY = 24 * 3600;

  // By default, use any available cached price
  let cachedPrice = await getCachedUSDPrice(currencyAddress, timestamp);
  if (
    // If the cached price is not available
    !cachedPrice ||
    // Or if the cached price is stale (older than what is requested)
    Math.floor(cachedPrice.timestamp / DAY) !== Math.floor(timestamp / DAY)
  ) {
    // Then try to fetch the price from upstream
    const upstreamPrice = await getUpstreamUSDPrice(currencyAddress, timestamp);
    if (upstreamPrice) {
      cachedPrice = upstreamPrice;
    }
  }

  return cachedPrice;
};

type USDAndNativePrices = {
  usdPrice?: string;
  nativePrice?: string;
};

export const getUSDAndNativePrices = async (
  currencyAddress: string,
  amount: string,
  timestamp: number
): Promise<USDAndNativePrices> => {
  const currencyUSDPrice = await getAvailableUSDPrice(currencyAddress, timestamp);
  const nativeUSDPrice = await getAvailableUSDPrice(AddressZero, timestamp);

  let usdPrice: string | undefined;
  let nativePrice: string | undefined;

  const currency = await getCurrency(currencyAddress);
  if (currency.decimals && currencyUSDPrice) {
    const currencyUnit = bn(10).pow(currency.decimals);
    usdPrice = bn(amount).mul(currencyUSDPrice.value).div(currencyUnit).toString();
    if (nativeUSDPrice) {
      nativePrice = bn(amount)
        .mul(currencyUSDPrice.value)
        .mul(NATIVE_UNIT)
        .div(nativeUSDPrice.value)
        .div(currencyUnit)
        .toString();
    }
  }

  return { usdPrice, nativePrice };
};
