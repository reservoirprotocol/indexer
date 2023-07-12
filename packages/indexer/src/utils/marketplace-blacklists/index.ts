import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { idb, redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { OrderKind } from "@/orderbook/orders";

export type Operator = {
  address: string;
  marketplace: OrderKind;
};

export const checkMarketplaceIsFiltered = async (
  contract: string,
  operators: string[],
  refresh?: boolean
) => {
  let result: string[] | null = [];
  if (refresh) {
    result = await updateMarketplaceBlacklist(contract);
  } else {
    const cacheKey = `marketplace-blacklist:${contract}`;
    result = refresh
      ? null
      : await redis.get(cacheKey).then((r) => (r ? (JSON.parse(r) as string[]) : null));
    if (!result) {
      result = await getMarketplaceBlacklistFromDB(contract);
      await redis.set(cacheKey, JSON.stringify(result), "EX", 24 * 3600);
    }
  }

  const customCheck = await isBlockedByCustomLogic(contract, operators);
  if (customCheck) {
    return customCheck;
  }

  return operators.some((c) => result!.includes(c));
};

export const isBlockedByCustomLogic = async (contract: string, operators: string[]) => {
  const cacheDuration = 24 * 3600;

  const cacheKey = `marketplace-blacklist-custom-logic:${contract}:${JSON.stringify(operators)}`;
  const cache = await redis.get(cacheKey);
  if (!cache) {
    const iface = new Interface([
      "function registry() view returns (address)",
      "function getWhitelistedOperators() view returns (address[])",
    ]);
    const nft = new Contract(contract, iface, baseProvider);

    // `getWhitelistedOperators()` (ERC721-C)
    try {
      const whitelistedOperators = await nft
        .getWhitelistedOperators()
        .then((ops: string[]) => ops.map((o) => o.toLowerCase()));
      const result = operators.some((o) => !whitelistedOperators.includes(o));

      await redis.set(cacheKey, result ? "1" : "0", "EX", cacheDuration);
      return result;
    } catch {
      // Skip errors
    }

    // `registry()`
    try {
      const registry = new Contract(
        await nft.registry(),
        new Interface([
          "function isAllowedOperator(address operator) external view returns (bool)",
        ]),
        baseProvider
      );
      const allowed = await Promise.all(operators.map((c) => registry.isAllowedOperator(c)));
      const result = allowed.some((c) => !c);

      await redis.set(cacheKey, result ? "1" : "0", "EX", cacheDuration);
      return result;
    } catch {
      // Skip errors
    }
  }

  return Boolean(Number(cache));
};

export const getMarketplaceBlacklist = async (contract: string): Promise<string[]> => {
  const iface = new Interface([
    "function filteredOperators(address registrant) external view returns (address[])",
  ]);

  const opensea = new Contract(
    Sdk.SeaportBase.Addresses.OperatorFilterRegistry[config.chainId],
    iface,
    baseProvider
  );
  const blur = new Contract(
    Sdk.Blur.Addresses.OperatorFilterRegistry[config.chainId],
    iface,
    baseProvider
  );
  const [openseaOperators, blurOperators] = await Promise.all([
    opensea.filteredOperators(contract),
    blur.filteredOperators(contract),
  ]);

  const allOperatorsList = openseaOperators
    .concat(blurOperators)
    .map((o: string) => o.toLowerCase());
  return Array.from(new Set(allOperatorsList));
};

export const getMarketplaceBlacklistFromDB = async (contract: string): Promise<string[]> => {
  const result = await redb.oneOrNone(
    `
      SELECT
        contracts.filtered_operators
      FROM contracts
      WHERE contracts.address = $/contract/
    `,
    { contract: toBuffer(contract) }
  );
  return result?.filtered_operators || [];
};

export const updateMarketplaceBlacklist = async (contract: string) => {
  const blacklist = await getMarketplaceBlacklist(contract);
  await idb.none(
    `
      UPDATE contracts
        SET filtered_operators = $/blacklist:json/
      WHERE contracts.address = $/contract/
    `,
    {
      contract: toBuffer(contract),
      blacklist,
    }
  );
  return blacklist;
};
