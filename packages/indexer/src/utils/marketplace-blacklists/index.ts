import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { idb, redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { OrderKind } from "@/orderbook/orders";
import * as erc721c from "@/utils/erc721c";

export type Operator = {
  address: string;
  marketplace: OrderKind;
};

export const checkMarketplaceIsFiltered = async (
  contract: string,
  operators: string[],
  refresh?: boolean
) => {
  // Custom rules
  if (
    config.chainId === 1 &&
    contract === "0x0c86cdc978b7d191f11b36731107e924c699af10" &&
    operators.includes(Sdk.BlurV2.Addresses.Delegate[config.chainId])
  ) {
    return true;
  }

  let result: string[] | null = [];
  if (refresh) {
    result = await updateMarketplaceBlacklist(contract);
  } else {
    const cacheKey = `marketplace-blacklist:${contract}`;
    result = await redis.get(cacheKey).then((r) => (r ? (JSON.parse(r) as string[]) : null));
    if (!result) {
      result = await getMarketplaceBlacklistFromDB(contract);
      await redis.set(cacheKey, JSON.stringify(result), "EX", 24 * 3600);
    }
  }

  const customCheck = await isBlockedByCustomLogic(contract, operators);
  if (customCheck) {
    return customCheck;
  }

  const erc721cCheck = await erc721c.checkMarketplaceIsFiltered(contract, operators);
  if (erc721cCheck) {
    return erc721cCheck;
  }

  return operators.some((c) => result!.includes(c));
};

export const isBlockedByCustomLogic = async (contract: string, operators: string[]) => {
  const cacheKey = `marketplace-blacklist-custom-logic:${contract}:${JSON.stringify(operators)}`;
  const cache = await redis.get(cacheKey);
  if (!cache) {
    const iface = new Interface([
      "function registry() view returns (address)",
      "function getWhitelistedOperators() view returns (address[])",
    ]);
    const nft = new Contract(contract, iface, baseProvider);
    let result = false;

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
      result = allowed.some((c) => !c);
    } catch {
      // Skip errors
    }

    // Positive case
    if (result) {
      await redis.set(cacheKey, "1", "EX", 24 * 3600);
      return result;
    }

    // Negative case
    await redis.set(cacheKey, "0", "EX", 24 * 3600);
  }

  return Boolean(Number(cache));
};

const getMarketplaceBlacklist = async (contract: string): Promise<string[]> => {
  const iface = new Interface([
    "function filteredOperators(address registrant) external view returns (address[])",
  ]);

  let openseaOperators: string[] = [];
  if (Sdk.SeaportBase.Addresses.OperatorFilterRegistry[config.chainId]) {
    const opensea = new Contract(
      Sdk.SeaportBase.Addresses.OperatorFilterRegistry[config.chainId],
      iface,
      baseProvider
    );
    openseaOperators = await opensea.filteredOperators(contract);
  }

  let blurOperators: string[] = [];
  if (Sdk.Blur.Addresses.OperatorFilterRegistry[config.chainId]) {
    const blur = new Contract(
      Sdk.Blur.Addresses.OperatorFilterRegistry[config.chainId],
      iface,
      baseProvider
    );
    blurOperators = await blur.filteredOperators(contract);
  }

  const allOperatorsList = openseaOperators
    .concat(blurOperators)
    .map((o: string) => o.toLowerCase());
  return Array.from(new Set(allOperatorsList));
};

const getMarketplaceBlacklistFromDB = async (contract: string): Promise<string[]> => {
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

const updateMarketplaceBlacklist = async (contract: string) => {
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
