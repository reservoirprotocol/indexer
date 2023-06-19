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

  const customCheck = await isBlockedByCustomRegistry(contract, operators);
  if (customCheck) {
    return customCheck;
  }

  return operators.some((c) => result!.includes(c));
};

export const isBlockedByCustomRegistry = async (contract: string, operators: string[]) => {
  const cacheKey = `marketplace-blacklist-custom-registry:${contract}:${JSON.stringify(operators)}`;
  const cache = await redis.get(cacheKey);
  if (!cache) {
    const iface = new Interface(["function registry() external view returns (address)"]);
    const nft = new Contract(contract, iface, baseProvider);

    let result = false;
    try {
      const registry = new Contract(
        await nft.registry(),
        new Interface([
          "function isAllowedOperator(address operator) external view returns (bool)",
        ]),
        baseProvider
      );
      const allowed = await Promise.all(operators.map((c) => registry.isAllowedOperator(c)));
      result = allowed.some((c) => c === false);
    } catch {
      // Skip errors
    }

    await redis.set(cacheKey, result ? "1" : "0", "EX", 24 * 3600);
    return result;
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
