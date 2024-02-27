import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { idb, redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { orderRevalidationsJob } from "@/jobs/order-fixes/order-revalidations-job";
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
  let result: string[] | null = [];
  if (refresh) {
    result = await updateMarketplaceBlacklist(contract);
  } else {
    const cacheKey = `marketplace-blacklist-2:${contract}`;
    result = await redis.get(cacheKey).then((r) => (r ? (JSON.parse(r) as string[]) : null));
    if (!result) {
      result = await getMarketplaceBlacklistFromDb(contract).then((r) => r.blacklist);
      await redis.set(cacheKey, JSON.stringify(result), "EX", 5 * 60);
    }
  }

  const customCheck = await isBlockedByCustomLogic(contract, operators, refresh);
  if (customCheck) {
    return customCheck;
  }

  const erc721cCheck = await erc721c.v1.checkMarketplaceIsFiltered(contract, operators);
  if (erc721cCheck) {
    return erc721cCheck;
  }

  const erc721cV2Check = await erc721c.v2.checkMarketplaceIsFiltered(contract, operators);
  if (erc721cV2Check) {
    return erc721cV2Check;
  }

  return operators.some((c) => result!.includes(c));
};

export const isBlockedByCustomLogic = async (
  contract: string,
  operators: string[],
  refresh?: boolean
) => {
  const cacheKey = `marketplace-blacklist-custom-logic-3:${contract}:${JSON.stringify(operators)}`;
  let cache = await redis.get(cacheKey);
  if (refresh || !cache) {
    const iface = new Interface([
      "function registry() view returns (address)",
      "function beforeTokenTransferHandler() view returns (address)",
    ]);
    const nft = new Contract(contract, iface, baseProvider);

    let result = false;
    let blacklist: string[] = [];

    // CUSTOM RULES
    const BLUR = Sdk.BlurV2.Addresses.Delegate[config.chainId];
    const OPENSEA = "0x1e0049783f008a0085193e00003d00cd54003c71";
    if (
      config.chainId === 1 &&
      [
        "0x0c86cdc978b7d191f11b36731107e924c699af10",
        "0x4d7d2e237d64d1484660b55c0a4cc092fa5e6716",
        "0x4b15a9c28034dc83db40cd810001427d3bd7163d",
        "0x2358693f4faec9d658bb97fc9cd8885f62105dc1",
        "0x769272677fab02575e84945f03eca517acc544cc",
        "0x8f1b132e9fd2b9a2b210baa186bf1ae650adf7ac",
        "0xd4b7d9bb20fa20ddada9ecef8a7355ca983cccb1",
        "0x572e33ffa523865791ab1c26b42a86ac244df784",
        "0x7daec605e9e2a1717326eedfd660601e2753a057",
      ].includes(contract) &&
      (operators.includes(BLUR) || operators.includes(OPENSEA))
    ) {
      result = true;
      blacklist = [BLUR, OPENSEA];
    }

    if (
      config.chainId === 1 &&
      ["0xc379e535caff250a01caa6c3724ed1359fe5c29b"].includes(contract) &&
      operators.includes(OPENSEA)
    ) {
      result = true;
      blacklist = [OPENSEA];
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
      result = allowed.some((c) => !c);

      if (result) {
        blacklist = operators;
      }
    } catch {
      // Skip errors
    }

    // `beforeTokenTransferHandler()`
    try {
      const registry = new Contract(
        await nft.beforeTokenTransferHandler(),
        new Interface(["function getDenylistOperators() view returns (address[])"]),
        baseProvider
      );

      const blockedOperators = await registry
        .getDenylistOperators()
        .then((ops: string[]) => ops.map((op) => op.toLowerCase()));
      result = operators.every((c) => blockedOperators.includes(c));

      blacklist = blockedOperators;
    } catch {
      // Skip errors
    }

    // Positive case
    if (result) {
      // Invalid any orders relying on the blacklisted operator
      if (blacklist.length) {
        await orderRevalidationsJob.addToQueue([
          {
            by: "operator",
            data: {
              origin: "marketplace-blacklist",
              contract,
              blacklistedOperators: blacklist,
              status: "inactive",
            },
          },
        ]);
      }

      await redis.set(cacheKey, "1", "EX", 5 * 60);
      return result;
    }

    // Negative case
    await redis.set(cacheKey, "0", "EX", 5 * 60);
    cache = "0";
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

export const getMarketplaceBlacklistFromDb = async (
  contract: string
): Promise<{ blacklist: string[] }> => {
  const result = await redb.oneOrNone(
    `
      SELECT
        contracts.filtered_operators
      FROM contracts
      WHERE contracts.address = $/contract/
    `,
    { contract: toBuffer(contract) }
  );
  return { blacklist: result?.filtered_operators || [] };
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

  // Invalid any orders relying on the blacklisted operator
  await orderRevalidationsJob.addToQueue([
    {
      by: "operator",
      data: {
        origin: "marketplace-blacklist",
        contract,
        blacklistedOperators: blacklist,
        status: "inactive",
      },
    },
  ]);

  return blacklist;
};
