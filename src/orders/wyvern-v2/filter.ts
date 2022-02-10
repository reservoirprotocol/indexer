import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";

import { db } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { OrderInfo } from "@/orders/wyvern-v2";
import { getOrderTarget } from "@/orders/wyvern-v2/utils";

type FilterResult = {
  valid: OrderInfo[];
  invalid: {
    orderInfo: OrderInfo;
    reason: string;
  }[];
};

export const filterOrders = async (
  orderInfos: OrderInfo[]
): Promise<FilterResult> => {
  const result: FilterResult = {
    valid: [],
    invalid: [],
  };

  if (!orderInfos.length) {
    return result;
  }

  // Get the kinds of all contracts targeted by the orders
  const contracts: { address: string; kind: string }[] = await db.manyOrNone(
    `
      select distinct
        "c"."address",
        "c"."kind"
      from "contracts" "c"
      where "c"."address" in ($1:csv)
    `,
    [orderInfos.map(({ order }) => getOrderTarget(order)).filter(Boolean)]
  );

  const contractKinds = new Map<string, string>();
  for (const { address, kind } of contracts) {
    contractKinds.set(address, kind);
  }

  // Get all orders we're already storing
  const hashes: { hash: string }[] = await db.manyOrNone(
    `
      select "o"."hash"
      from "orders" "o"
      where "o"."hash" in ($1:csv)
    `,
    [orderInfos.map(({ order }) => order.prefixHash())]
  );

  const existingHashes = new Set<string>();
  for (const { hash } of hashes) {
    existingHashes.add(hash);
  }

  for (const orderInfo of orderInfos) {
    const { order } = orderInfo;

    const target = getOrderTarget(order);
    const hash = order.prefixHash();

    // Check: order doesn't already exist
    if (existingHashes.has(hash)) {
      result.invalid.push({ orderInfo, reason: "Order already exists" });
      continue;
    }

    // Check: order has a valid target
    if (!target || !order.params.kind?.startsWith(contractKinds.get(target)!)) {
      result.invalid.push({
        orderInfo,
        reason: "Order has unsupported target",
      });
      continue;
    }

    const currentTime = Math.floor(Date.now() / 1000);

    // Check: order has a valid listing time
    const listingTime = order.params.listingTime;
    if (listingTime >= currentTime) {
      result.invalid.push({
        orderInfo,
        reason: "Order has an invalid listing time",
      });
      continue;
    }

    // Check: order is not expired
    const expirationTime = order.params.expirationTime;
    if (expirationTime !== 0 && currentTime >= expirationTime) {
      result.invalid.push({ orderInfo, reason: "Order is expired" });
      continue;
    }

    // Check: order has a non-zero fee recipient
    if (order.params.feeRecipient === AddressZero) {
      result.invalid.push({ orderInfo, reason: "Fee recipient is zero" });
      continue;
    }

    // Check: buy order has Weth as payment token
    if (
      order.params.side === 0 &&
      order.params.paymentToken !== Sdk.Common.Addresses.Weth[config.chainId]
    ) {
      result.invalid.push({
        orderInfo,
        reason: "Order has unsupported payment token",
      });
      continue;
    }

    // Check: sell order has Eth as payment token
    if (
      order.params.side === 1 &&
      order.params.paymentToken !== Sdk.Common.Addresses.Eth[config.chainId]
    ) {
      result.invalid.push({
        orderInfo,
        reason: "Order has unsupported payment token",
      });
      continue;
    }

    // Check: order is not private
    if (order.params.taker !== AddressZero) {
      result.invalid.push({
        orderInfo,
        reason: "Order is private",
      });
      continue;
    }

    // Check: order is valid
    try {
      order.checkValidity();
    } catch {
      result.invalid.push({
        orderInfo,
        reason: "Order is invalid",
      });
      continue;
    }

    // Check: order has a valid signature
    try {
      await order.checkSignature();
    } catch {
      result.invalid.push({
        orderInfo,
        reason: "Order has invalid signature",
      });
      continue;
    }

    // Check: order is fillable
    try {
      await order.checkFillability(baseProvider);
    } catch {
      result.invalid.push({
        orderInfo,
        reason: "Order is not fillable",
      });
      continue;
    }

    result.valid.push(orderInfo);
  }

  return result;
};
