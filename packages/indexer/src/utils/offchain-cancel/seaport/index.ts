import { verifyTypedData } from "@ethersproject/wallet";
import * as Sdk from "@reservoir0x/sdk";
import { MatchParams, OrderComponents } from "@reservoir0x/sdk/dist/seaport-base/types";

import { idb } from "@/common/db";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { cosigner, saveOffChainCancellations } from "@/utils/offchain-cancel";
import { Features, FlaggedTokensChecker } from "@/utils/offchain-cancel/seaport/flagged-tokens";

type OrderKind = "seaport-v1.4" | "seaport-v1.5" | "alienswap";

type CancelCall = {
  orderKind: OrderKind;
  signature: string;
  orders: OrderComponents[];
};

type ReplacementCall = {
  orderKind: OrderKind;
  newOrders: OrderComponents[];
  replacedOrders: OrderComponents[];
};

export const createOrder = (
  chainId: number,
  orderData: OrderComponents,
  orderKind: "seaport-v1.4" | "seaport-v1.5" | "alienswap"
): Sdk.SeaportV14.Order | Sdk.SeaportV15.Order | Sdk.Alienswap.Order => {
  if (orderKind === "alienswap") {
    return new Sdk.Alienswap.Order(chainId, orderData);
  } else if (orderKind === "seaport-v1.4") {
    return new Sdk.SeaportV14.Order(chainId, orderData);
  } else {
    return new Sdk.SeaportV15.Order(chainId, orderData);
  }
};

export const hashOrders = async (
  orders: OrderComponents[],
  orderKind: "seaport-v1.4" | "seaport-v1.5" | "alienswap"
) => {
  let orderSigner: string | undefined;

  const orderHashes = [];
  for (const orderData of orders) {
    const order = createOrder(config.chainId, orderData, orderKind);
    const orderHash = order.hash();

    try {
      await order.checkSignature();
    } catch {
      throw new Error("Wrong order signature");
    }

    if (!orderSigner) {
      orderSigner = order.params.offerer;
    } else if (order.params.offerer.toLowerCase() !== orderSigner.toLowerCase()) {
      throw new Error("Signer mismatch");
    }

    orderHashes.push(orderHash);
  }

  return { orderHashes, orderSigner };
};

export const verifyOffChainCancellationSignature = (
  orderIds: string[],
  signature: string,
  signer: string
) => {
  const message = generateOffChainCancellationSignatureData(orderIds);
  const recoveredSigner = verifyTypedData(message.domain, message.types, message.value, signature);
  return recoveredSigner.toLowerCase() === signer.toLowerCase();
};

export const generateOffChainCancellationSignatureData = (orderIds: string[]) => {
  const cancellationZone = Sdk.SeaportBase.Addresses.ReservoirCancellationZone[config.chainId];
  return {
    signatureKind: "eip712",
    domain: {
      name: "SignedZone",
      version: "1.0.0",
      chainId: config.chainId,
      verifyingContract: cancellationZone,
    },
    types: { OrderHashes: [{ name: "orderHashes", type: "bytes32[]" }] },
    value: {
      orderHashes: orderIds,
    },
    primaryType: "OrderHashes",
  };
};

export const doCancel = async (data: CancelCall) => {
  const cancellationZone = Sdk.SeaportBase.Addresses.ReservoirCancellationZone[config.chainId];
  const orders = data.orders;

  if (orders.some((order) => order.zone !== cancellationZone)) {
    throw Error("Unauthorized");
  }

  const { orderHashes, orderSigner } = await hashOrders(orders, data.orderKind);
  if (!orderHashes || !orderSigner) {
    throw Error("Unauthorized");
  }

  const success = verifyOffChainCancellationSignature(orderHashes, data.signature, orderSigner!);
  if (!success) {
    throw Error("Unauthorized");
  }

  await saveOffChainCancellations(orderHashes!);
};

export const doReplacement = async ({ replacedOrders, newOrders, orderKind }: ReplacementCall) => {
  const result = await hashOrders(replacedOrders, orderKind);
  const { orderHashes, orderSigner } = result;

  const replacedOrdersByHash = new Map(orderHashes!.map((hash, i) => [hash, replacedOrders[i]]));

  const salts = [];
  for (const orderData of newOrders) {
    const order = createOrder(config.chainId, orderData, orderKind);

    try {
      await order.checkSignature();
    } catch {
      throw new Error("Wrong order signature");
    }

    if (order.params.offerer.toLowerCase() !== orderSigner?.toLowerCase()) {
      throw new Error("Signer mismatch");
    }

    if (bn(order.params.salt).isZero()) {
      throw new Error("Salt is missing");
    }

    const replacedOrder = replacedOrdersByHash.get(order.params.salt);
    if (!replacedOrder || replacedOrder.offerer != orderSigner) {
      throw new Error("Signer mismatch");
    }

    salts.push(order.params.salt);
  }

  await saveOffChainCancellations(salts);
};

export const doSignOrder = async (
  order: Sdk.SeaportV14.Order | Sdk.SeaportV15.Order | Sdk.Alienswap.Order,
  taker: string,
  matchParams: MatchParams
) => {
  if (order.isCosignedOrder()) {
    const isOffChainCancelled = await idb.oneOrNone(
      `SELECT 1 FROM off_chain_cancellations WHERE order_id = $/orderId/`,
      { orderId: order.hash() }
    );
    if (isOffChainCancelled) {
      throw new Error("Order is off-chain cancelled");
    }

    const features = new Features(order.params.zoneHash);
    if (features.checkFlagged()) {
      const requestedReceivedItems = order.getReceivedItems(matchParams);

      const flaggedTokensChecker = new FlaggedTokensChecker(requestedReceivedItems);
      const hasFlaggedTokens = await flaggedTokensChecker.containsFlagged(requestedReceivedItems);
      if (hasFlaggedTokens) {
        throw new Error("Order references flagged tokens");
      }
    }

    await order.cosign(cosigner(), taker, matchParams);
  }
};
