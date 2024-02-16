import { AddressZero } from "@ethersproject/constants";
import { parseUnits } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
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
    currencyAddress = currencyAddress.toLowerCase();

    const date = new Date(timestamp * 1000);
    const truncatedTimestamp = Math.floor(date.valueOf() / 1000);

    const currency = await getCurrency(currencyAddress);
    const coingeckoCurrencyId = currency?.metadata?.coingeckoCurrencyId;

    if (coingeckoCurrencyId) {
      const day = date.getDate();
      const month = date.getMonth() + 1;
      const year = date.getFullYear();

      const url = `https://api.coingecko.com/api/v3/coins/${coingeckoCurrencyId}/history?date=${day}-${month}-${year}`;

      logger.info("prices", `Fetching price from Coingecko: ${url}`);

      const result: {
        market_data: {
          current_price: { [symbol: string]: number };
        };
      } = await axios
        .get(url, {
          timeout: 10 * 1000,
        })
        .then((response) => response.data)
        .catch((error) => {
          if (config.coinGeckoWsApiKey && error.response?.status === 429) {
            logger.warn(
              "prices",
              JSON.stringify({
                message: `Rate limited during fetch upstream USD price for ${currencyAddress} and timestamp ${timestamp}: ${error}`,
                error,
              })
            );

            const url = `https://pro-api.coingecko.com/api/v3/coins/${coingeckoCurrencyId}/history?date=${day}-${month}-${year}&x_cg_pro_api_key=${config.coinGeckoWsApiKey}`;

            logger.info("prices", `Fetching price from Coingecko fallbck: ${url}`);

            return axios
              .get(url, {
                timeout: 10 * 1000,
              })
              .then((response) => response.data);
          }

          throw error;
        });

      const usdPrice = result?.market_data?.current_price?.["usd"];
      if (usdPrice) {
        const value = parseUnits(usdPrice.toFixed(USD_DECIMALS), USD_DECIMALS).toString();

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
    } else if (isWhitelistedCurrency(currencyAddress) || isTestnetCurrency(currencyAddress)) {
      // Whitelisted currencies don't have a price, so we just hardcode a very high number
      let value = "1000000000000000"; // 1,000,000,000:1 to USD
      if (Sdk.Common.Addresses.Usdc[config.chainId]?.includes(currencyAddress)) {
        // 1:1 to USD
        value = "1000000";
      } else if (
        // This will only nicely work for chains where ETH is the native currency
        [
          Sdk.Common.Addresses.Native[config.chainId],
          Sdk.Common.Addresses.WNative[config.chainId],
          // Only needed for Mumbai
          "0xa6fa4fb5f76172d178d61b04b0ecd319c5d1c0aa",
        ].includes(currencyAddress)
      ) {
        // 2000:1 to USD
        value = "2000000000";
      }

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
  } catch (error) {
    logger.error(
      "prices",
      JSON.stringify({
        message: `Failed to fetch upstream USD price for ${currencyAddress} and timestamp ${timestamp}: ${error}`,
        error,
      })
    );
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

const USD_PRICE_MEMORY_CACHE = new Map<string, Price>();
export const getAvailableUSDPrice = async (
  currencyAddress: string,
  timestamp: number,
  acceptStalePrice?: boolean
) => {
  // At the moment, we support day-level granularity for prices
  const DAY = 24 * 3600;

  const normalizedTimestamp = Math.floor(timestamp / DAY);
  const key = `${currencyAddress}-${normalizedTimestamp}`.toLowerCase();
  if (!USD_PRICE_MEMORY_CACHE.has(key)) {
    // If the price is not available in the memory cache, use any available database cached price
    let cachedPrice = await getCachedUSDPrice(currencyAddress, timestamp);

    // Fetch the latest price from upstream if:
    // - we have no price available
    // - we have a stale price available and stale prices are not accepted
    let fetchFromUpstream = false;
    if (cachedPrice) {
      const isStale = Math.floor(cachedPrice.timestamp / DAY) !== normalizedTimestamp;
      if (isStale && !acceptStalePrice) {
        fetchFromUpstream = true;
      }
    } else {
      fetchFromUpstream = true;
    }

    if (fetchFromUpstream) {
      const upstreamPrice = await getUpstreamUSDPrice(currencyAddress, timestamp);
      if (upstreamPrice) {
        cachedPrice = upstreamPrice;
      }
    }

    if (cachedPrice) {
      USD_PRICE_MEMORY_CACHE.set(key, cachedPrice);
    }
  }

  return USD_PRICE_MEMORY_CACHE.get(key);
};

const isTestnetCurrency = (currencyAddress: string) => {
  if ([5, 11155111, 84531, 59140, 5001, 80001, 534353, 999].includes(config.chainId)) {
    return [
      Sdk.Common.Addresses.Native[config.chainId],
      Sdk.Common.Addresses.WNative[config.chainId],
      ...(Sdk.Common.Addresses.Usdc[config.chainId] ?? []),
      ...Object.keys(getNetworkSettings().supportedBidCurrencies),
    ].includes(currencyAddress);
  }
};

export const isWhitelistedCurrency = (currencyAddress: string) =>
  getNetworkSettings().whitelistedCurrencies.has(currencyAddress.toLowerCase());

const areEquivalentCurrencies = (currencyAddress1: string, currencyAddress2: string) => {
  const equivalentCurrencySets = [
    [
      Sdk.Common.Addresses.Native[config.chainId],
      Sdk.Common.Addresses.WNative[config.chainId],
      Sdk.Blur.Addresses.Beth[config.chainId],
    ],
  ];
  for (const equivalentCurrencies of equivalentCurrencySets) {
    if (
      equivalentCurrencies.includes(currencyAddress1) &&
      equivalentCurrencies.includes(currencyAddress2)
    ) {
      return true;
    }
  }

  return false;
};

export type USDAndNativePrices = {
  usdPrice?: string;
  nativePrice?: string;
};

// TODO: Build on top of `getUSDAndCurrencyPrices`
export const getUSDAndNativePrices = async (
  currencyAddress: string,
  price: string,
  timestamp: number,
  options?: {
    onlyUSD?: boolean;
    acceptStalePrice?: boolean;
    nonZeroCommunityTokens?: boolean;
  }
): Promise<USDAndNativePrices> => {
  let usdPrice: string | undefined;
  let nativePrice: string | undefined;

  if (
    getNetworkSettings().coingecko?.networkId ||
    isTestnetCurrency(currencyAddress) ||
    isWhitelistedCurrency(currencyAddress) ||
    // Allow price conversion on Zora which is not supported by Coingecko
    (config.chainId === 7777777 &&
      _.includes(
        [Sdk.Common.Addresses.Native[config.chainId], Sdk.Common.Addresses.WNative[config.chainId]],
        currencyAddress
      ))
  ) {
    const currencyUSDPrice = await getAvailableUSDPrice(
      currencyAddress,
      timestamp,
      options?.acceptStalePrice
    );

    let nativeUSDPrice: Price | undefined;
    if (!options?.onlyUSD) {
      nativeUSDPrice = await getAvailableUSDPrice(
        AddressZero,
        timestamp,
        options?.acceptStalePrice
      );
    }

    const currency = await getCurrency(currencyAddress);
    if (currency.decimals && currencyUSDPrice) {
      const currencyUnit = bn(10).pow(currency.decimals);
      usdPrice = bn(price).mul(currencyUSDPrice.value).div(currencyUnit).toString();
      if (nativeUSDPrice) {
        nativePrice = bn(price)
          .mul(currencyUSDPrice.value)
          .mul(NATIVE_UNIT)
          .div(nativeUSDPrice.value)
          .div(currencyUnit)
          .toString();
      }
    }
  }

  // Make sure to handle equivalent currencies
  if (areEquivalentCurrencies(currencyAddress, Sdk.Common.Addresses.Native[config.chainId])) {
    nativePrice = price;
  }

  // If zeroCommunityTokens and community tokens set native/usd value to 0
  if (
    !options?.nonZeroCommunityTokens &&
    isWhitelistedCurrency(currencyAddress) &&
    !_.includes(Sdk.Common.Addresses.Usdc[config.chainId], currencyAddress)
  ) {
    usdPrice = "0";
    nativePrice = "0";
  }

  return { usdPrice, nativePrice };
};

export type USDAndCurrencyPrices = {
  usdPrice?: string;
  currencyPrice?: string;
};

export const getUSDAndCurrencyPrices = async (
  fromCurrencyAddress: string,
  toCurrencyAddress: string,
  price: string,
  timestamp: number,
  options?: {
    onlyUSD?: boolean;
    acceptStalePrice?: boolean;
  }
): Promise<USDAndCurrencyPrices> => {
  let usdPrice: string | undefined;
  let currencyPrice: string | undefined;

  // Only try to get pricing data if the network supports it
  if (
    getNetworkSettings().coingecko?.networkId ||
    (isTestnetCurrency(fromCurrencyAddress) && isTestnetCurrency(toCurrencyAddress)) ||
    (isWhitelistedCurrency(fromCurrencyAddress) && isWhitelistedCurrency(toCurrencyAddress)) ||
    // Allow price conversion on Zora which is not supported by Coingecko
    (config.chainId === 7777777 &&
      _.includes(
        [Sdk.Common.Addresses.Native[config.chainId], Sdk.Common.Addresses.WNative[config.chainId]],
        fromCurrencyAddress
      ) &&
      _.includes(
        [Sdk.Common.Addresses.Native[config.chainId], Sdk.Common.Addresses.WNative[config.chainId]],
        toCurrencyAddress
      ))
  ) {
    // Get the FROM currency price
    const fromCurrencyUSDPrice = await getAvailableUSDPrice(
      fromCurrencyAddress,
      timestamp,
      options?.acceptStalePrice
    );

    let toCurrencyUSDPrice: Price | undefined;
    if (!options?.onlyUSD) {
      toCurrencyUSDPrice = await getAvailableUSDPrice(
        toCurrencyAddress,
        timestamp,
        options?.acceptStalePrice
      );
    }

    const fromCurrency = await getCurrency(fromCurrencyAddress);
    const toCurrency = await getCurrency(toCurrencyAddress);

    if (fromCurrency.decimals && fromCurrencyUSDPrice) {
      const fromCurrencyUnit = bn(10).pow(fromCurrency.decimals!);
      const toCurrencyUnit = bn(10).pow(toCurrency.decimals!);

      usdPrice = bn(price).mul(fromCurrencyUSDPrice.value).div(fromCurrencyUnit).toString();
      if (toCurrencyUSDPrice) {
        currencyPrice = bn(price)
          .mul(fromCurrencyUSDPrice.value)
          .mul(toCurrencyUnit)
          .div(toCurrencyUSDPrice.value)
          .div(fromCurrencyUnit)
          .toString();
      }
    }
  }

  // Make sure to handle equivalent currencies
  if (areEquivalentCurrencies(fromCurrencyAddress, toCurrencyAddress)) {
    currencyPrice = price;
  }

  // Set community tokens native/usd value to 0
  if (
    isWhitelistedCurrency(fromCurrencyAddress) &&
    !_.includes(Sdk.Common.Addresses.Usdc[config.chainId], fromCurrencyAddress)
  ) {
    usdPrice = "0";
    currencyPrice = "0";
  }

  return { usdPrice, currencyPrice };
};
