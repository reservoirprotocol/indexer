import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { toBuffer } from "@/common/utils";
import { getNetworkSettings } from "@/config/network";
import { currenciesFetchJob } from "@/jobs/currencies/currencies-fetch-job";

type CurrencyMetadata = {
  coingeckoCurrencyId?: string;
  image?: string;
};

export type Currency = {
  contract: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  metadata?: CurrencyMetadata;
};

const CURRENCY_MEMORY_CACHE: Map<string, Currency> = new Map<string, Currency>();
export const getCurrency = async (currencyAddress: string): Promise<Currency> => {
  if (!CURRENCY_MEMORY_CACHE.has(currencyAddress)) {
    const result = await idb.oneOrNone(
      `
        SELECT
          currencies.name,
          currencies.symbol,
          currencies.decimals,
          currencies.metadata
        FROM currencies
        WHERE currencies.contract = $/contract/
      `,
      {
        contract: toBuffer(currencyAddress),
      }
    );

    if (result) {
      CURRENCY_MEMORY_CACHE.set(currencyAddress, {
        contract: currencyAddress,
        name: result.name,
        symbol: result.symbol,
        decimals: result.decimals,
        metadata: result.metadata,
      });
    } else {
      let name: string | undefined;
      let symbol: string | undefined;
      let decimals: number | undefined;
      let metadata: CurrencyMetadata | undefined;

      // If the currency is not available, then we try to retrieve its details
      try {
        ({ name, symbol, decimals, metadata } = await tryGetCurrencyDetails(currencyAddress));
      } catch (error) {
        logger.error(
          "currencies",
          `Failed to initially fetch ${currencyAddress} currency details: ${error}`
        );

        if (getNetworkSettings().whitelistedCurrencies.has(currencyAddress.toLowerCase())) {
          ({ name, symbol, decimals, metadata } = getNetworkSettings().whitelistedCurrencies.get(
            currencyAddress.toLowerCase()
          )!);
        } else {
          // TODO: Although an edge case, we should ensure that when the job
          // finally succeeds fetching the details of a currency, we also do
          // update the memory cache (otherwise the cache will be stale).

          // Retry fetching the currency details
          await currenciesFetchJob.addToQueue({ currency: currencyAddress });
        }
      }

      metadata = metadata || {};

      await idb.none(
        `
          INSERT INTO currencies (
            contract,
            name,
            symbol,
            decimals,
            metadata
          ) VALUES (
            $/contract/,
            $/name/,
            $/symbol/,
            $/decimals/,
            $/metadata:json/
          ) ON CONFLICT DO NOTHING
        `,
        {
          contract: toBuffer(currencyAddress),
          name,
          symbol,
          decimals,
          metadata,
        }
      );

      // Update the in-memory cache
      CURRENCY_MEMORY_CACHE.set(currencyAddress, {
        contract: currencyAddress,
        name,
        symbol,
        decimals,
        metadata,
      });
    }
  }

  return CURRENCY_MEMORY_CACHE.get(currencyAddress)!;
};

export const tryGetCurrencyDetails = async (currencyAddress: string) => {
  // `name`, `symbol` and `decimals` are fetched from on-chain
  const iface = new Interface([
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ]);

  const contract = new Contract(currencyAddress, iface, baseProvider);
  const name = await contract.name();
  const symbol = await contract.symbol();
  const decimals = await contract.decimals();
  const metadata: CurrencyMetadata = {};

  const coingeckoNetworkId = getNetworkSettings().coingecko?.networkId;
  if (coingeckoNetworkId) {
    const result: { id?: string; image?: { large?: string } } = await axios
      .get(
        `https://api.coingecko.com/api/v3/coins/${coingeckoNetworkId}/contract/${currencyAddress}`,
        { timeout: 10 * 1000 }
      )
      .then((response) => response.data);
    if (result.id) {
      metadata.coingeckoCurrencyId = result.id;
    }
    if (result.image?.large) {
      metadata.image = result.image.large;
    }
  }

  // Make sure to update the in-memory cache
  CURRENCY_MEMORY_CACHE.set(currencyAddress, {
    contract: currencyAddress,
    name,
    symbol,
    decimals,
    metadata,
  });

  return {
    name,
    symbol,
    decimals,
    metadata,
  };
};
