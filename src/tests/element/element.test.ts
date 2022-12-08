import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { baseProvider } from "@/common/provider";
import allTx from "./__fixtures__/tx";
import { idb } from "@/common/db";
import { getEventsFromTx, wait } from "../utils/test";
import { handleEvents } from "@/events-sync/handlers/element";
// import { handleEvents } from "@/events-sync/handlers/erc721";
import { processOnChainData } from "@/events-sync/handlers/utils";
import { OrderInfo } from "@/orderbook/orders/element";
import { logger } from "@/common/logger";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { config } from "@/config/index";
import { Element } from "@reservoir0x/sdk";

async function extractSellOrder(
  chainId: number,
  exchange: Element.Exchange,
  transaction: TransactionResponse,
  isERC721: boolean
) {
  const callArgs = exchange.contract.interface.decodeFunctionData(
    isERC721 ? "buyERC721" : "buyERC1155",
    transaction.data
  );
  const order = callArgs.sellOrder;
  const signature = callArgs.signature;
  // const orderInfo = builder.build(order);
  const builder = new Element.Builders.SingleToken(chainId);
  const buyOrder = builder.build({
    direction: "sell",
    maker: order.maker,
    contract: !isERC721 ? order.erc1155Token.toString() : order.nft,
    tokenId: !isERC721 ? order.erc1155TokenId.toString() : order.nftId.toString(),
    paymentToken: order.erc20Token,
    price: order.erc20TokenAmount.toString(),
    hashNonce: (await exchange.getHashNonce(baseProvider, order.maker)).toString(),
    expiry: order.expiry.toString(),
    nonce: order.nonce.toString(),
    fees: order.fees.map((_: { recipient: string; amount: string; feeData: string }) => {
      return {
        recipient: _.recipient,
        amount: _.amount.toString(),
        feeData: _.feeData.toString(),
      };
    }),
    amount: isERC721 ? null : order.erc1155TokenAmount.toString(),
    signatureType: signature.signatureType.toString(),
    v: signature.v.toString(),
    r: signature.r.toString(),
    s: signature.s.toString(),
  });
  let isValidSignature = true;
  try {
    buyOrder.checkSignature();
  } catch (e) {
    isValidSignature = false;
  }

  return {
    isValidSignature,
    order: buyOrder.params,
    orderId: buyOrder.id(),
    orderHash: buyOrder.hash(),
  };
}

async function getOrder(orderId: string) {
  const [order] = await Promise.all([
    idb.oneOrNone(`SELECT fillability_status FROM "orders" "o" WHERE "o"."id" = $/id/`, {
      id: orderId,
    }),
  ]);
  return order;
}

describe("ElementExchange", () => {
  const chainId = config.chainId;
  const exchange = new Element.Exchange(chainId);

  beforeEach(async () => {
    if (chainId != 1) {
      logger.error("ElementExchange", "please switch to mainnet");
      process.exit();
    }
  });

  test("buyERC721", async () => {
    const transaction = await baseProvider.getTransaction(allTx.testnet.buyERC721);

    // Parse order form calldata
    const orderInfo = await extractSellOrder(chainId, exchange, transaction, true);
    const orderId = orderInfo.orderHash;

    // Store orders
    const orders: OrderInfo[] = [];
    orders.push({
      orderParams: orderInfo.order,
      metadata: {},
    });

    await processOnChainData({
      orders: orders.map((info) => ({
        kind: "element",
        info,
      })),
    });

    await wait(20 * 1000);

    const tx = await baseProvider.getTransactionReceipt(allTx.buyERC721);
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);

    const fillOrder = result.orderInfos?.filter((_) => _.id === orderId);

    expect(fillOrder).not.toBe(null);
    expect(result.orderInfos?.length).toEqual(1);
    expect(result.fillEvents?.length).toEqual(1);
    expect(result.fillInfos?.length).toEqual(1);

    await processOnChainData(result);

    await wait(20 * 1000);

    const order = await getOrder(orderId);
    expect(order?.fillability_status).toEqual("filled");
  });

  test("buyERC721-v2", async () => {
    const transaction = await baseProvider.getTransaction(allTx.v2.buyERC721);

    // Parse order form calldata
    const orderInfo = await extractSellOrder(chainId, exchange, transaction, true);
    const orderId = orderInfo.orderId;

    // Store orders
    const orders: OrderInfo[] = [];
    orders.push({
      orderParams: orderInfo.order,
      metadata: {},
    });

    await processOnChainData({
      orders: orders.map((info) => ({
        kind: "element",
        info,
      })),
    });

    await wait(20 * 1000);

    const tx = await baseProvider.getTransactionReceipt(allTx.v2.buyERC721);
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);

    const fillOrder = result.orderInfos?.filter((_) => _.id === orderId);

    expect(fillOrder).not.toBe(null);
    expect(result.orderInfos?.length).toEqual(1);
    expect(result.fillEvents?.length).toEqual(1);
    expect(result.fillInfos?.length).toEqual(1);

    await processOnChainData(result);

    await wait(20 * 1000);

    const order = await getOrder(orderId);
    expect(order?.fillability_status).toEqual("filled");
  });

  test("buyERC1155", async () => {
    const transaction = await baseProvider.getTransaction(allTx.buyERC1155);

    // Parse order form calldata
    const orderInfo = await extractSellOrder(chainId, exchange, transaction, false);
    // const orderId = orderInfo.orderHash;

    // Store orders
    const orders: OrderInfo[] = [];
    orders.push({
      orderParams: orderInfo.order,
      metadata: {},
    });

    await processOnChainData({
      orders: orders.map((info) => ({
        kind: "element",
        info,
      })),
    });

    await wait(20 * 1000);

    const tx = await baseProvider.getTransactionReceipt(allTx.buyERC1155);

    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);

    expect(result.orderInfos?.length).toEqual(1);
    expect(result.fillEventsPartial?.length).toEqual(1);
    expect(result.fillInfos?.length).toEqual(1);

    await processOnChainData(result);

    // await wait(20 * 1000);
  });

  test("sellERC721", async () => {
    const tx = await baseProvider.getTransactionReceipt(allTx.v2.sellERC721);
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);
    expect(result.orderInfos?.length).toEqual(1);
  });

  test("buyERC1155-v2", async () => {
    const tx = await baseProvider.getTransactionReceipt(allTx.v2.buyERC1155);
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);
    expect(result.orderInfos?.length).toEqual(1);
  });

  test("cancelERC721", async () => {
    const tx = await baseProvider.getTransactionReceipt(allTx.cancelERC721);
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);
    expect(result.nonceCancelEvents?.length).toEqual(1);
  });

  test("cancelERC1155Order", async () => {
    const tx = await baseProvider.getTransactionReceipt(allTx.cancelERC1155Order);
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);
    expect(result.nonceCancelEvents?.length).toEqual(1);
  });
});
