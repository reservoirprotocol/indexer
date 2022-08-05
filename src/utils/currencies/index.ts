import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { toBuffer } from "@/common/utils";
import { getNetworkSettings } from "@/config/network";

type CurrencyMetadata = {
  coingeckoCurrencyId?: string;
};

export type Currency = {
  contract: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  metadata?: CurrencyMetadata;
};

export const getCurrency = async (currencyAddress: string): Promise<Currency> => {
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
    return {
      contract: currencyAddress,
      name: result.name,
      symbol: result.symbol,
      decimals: result.decimals,
      metadata: result.metadata,
    };
  } else {
    let name: string | undefined;
    let symbol: string | undefined;
    let decimals: number | undefined;
    let metadata: CurrencyMetadata = {};

    // If the currency is not available, then we try to retrieve its details
    try {
      // `name`, `symbol` and `decimals` are fetched from on-chain
      const iface = new Interface([
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
      ]);

      const contract = new Contract(currencyAddress, iface, baseProvider);
      name = await contract.name();
      symbol = await contract.symbol();
      decimals = await contract.decimals();
      metadata = {};

      const coingeckoNetworkId = getNetworkSettings().coingecko?.networkId;
      if (coingeckoNetworkId) {
        const result: { id?: string } = await axios
          .get(
            `https://api.coingecko.com/api/v3/coins/${coingeckoNetworkId}/contract/${currencyAddress}`,
            { timeout: 10 * 1000 }
          )
          .then((response) => response.data);
        if (result.id) {
          metadata.coingeckoCurrencyId = result.id;
        }
      }
    } catch (error) {
      // TODO: Retry via a job queue
      logger.error("currencies", `Failed to fetch ${currencyAddress} currency details: ${error}`);
    }

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

    return {
      contract: currencyAddress,
      name,
      symbol,
      decimals,
      metadata,
    };
  }
};
