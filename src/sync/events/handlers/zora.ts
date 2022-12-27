import { Result } from "@ethersproject/abi";

import { bn } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import * as es from "@/events-sync/storage";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { OrderInfo, getOrderId } from "@/orderbook/orders/zora";
import { getUSDAndNativePrices } from "@/utils/prices";

import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

const getOrderParams = (args: Result) => {
  const tokenId = args["tokenId"].toString();
  const tokenContract = args["tokenContract"].toLowerCase();
  const ask = args["ask"];
  const askPrice = ask["askPrice"].toString();
  const askCurrency = ask["askCurrency"].toLowerCase();
  const sellerFundsRecipient = ask["sellerFundsRecipient"].toLowerCase();
  const findersFeeBps = ask["findersFeeBps"];

  return {
    tokenContract,
    tokenId,
    askPrice,
    askCurrency,
    sellerFundsRecipient,
    findersFeeBps,
  };
};

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const cancelEventsOnChain: es.cancels.Event[] = [];
  const fillEventsOnChain: es.fills.Event[] = [];

  const fillInfos: fillUpdates.FillInfo[] = [];
  const orderInfos: orderUpdatesById.OrderInfo[] = [];

  // Keep track of any on-chain orders
  const orders: OrderInfo[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    const eventData = getEventData([kind])[0];
    switch (kind) {
      // Zora
      case "zora-ask-filled": {
        const { args } = eventData.abi.parseLog(log);
        const tokenContract = args["tokenContract"].toLowerCase();
        const tokenId = args["tokenId"].toString();
        let taker = args["buyer"].toLowerCase();
        const ask = args["ask"];
        const seller = ask["seller"].toLowerCase();
        const askCurrency = ask["askCurrency"].toLowerCase();
        const askPrice = ask["askPrice"].toString();

        const orderParams = getOrderParams(args);
        const orderId = getOrderId(orderParams);

        // Handle: attribution

        const orderKind = "zora-v3";
        const data = await utils.extractAttributionData(baseEventParams.txHash, orderKind, {
          orderId,
        });
        if (data.taker) {
          taker = data.taker;
        }

        // Handle: prices

        const prices = await getUSDAndNativePrices(
          askCurrency,
          askPrice,
          baseEventParams.timestamp
        );
        if (!prices.nativePrice) {
          // We must always have the native price
          break;
        }

        fillEventsOnChain.push({
          orderKind,
          orderId,
          currency: askCurrency,
          orderSide: "sell",
          maker: seller,
          taker,
          price: prices.nativePrice,
          currencyPrice: askPrice,
          usdPrice: prices.usdPrice,
          contract: tokenContract,
          tokenId,
          amount: "1",
          orderSourceId: data.orderSource?.id,
          aggregatorSourceId: data.aggregatorSource?.id,
          fillSourceId: data.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: `zora-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide: "sell",
          contract: tokenContract,
          tokenId,
          amount: "1",
          price: prices.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }

      case "zora-ask-created": {
        const { args } = eventData.abi.parseLog(log);
        const orderParams = getOrderParams(args);
        const maker = (await utils.fetchTransaction(baseEventParams.txHash)).from.toLowerCase();
        const seller = args["ask"]["seller"].toLowerCase();

        orders.push({
          orderParams: {
            seller,
            maker,
            side: "sell",
            ...orderParams,
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          metadata: {},
        });

        break;
      }

      case "zora-ask-cancelled": {
        const { args } = eventData.abi.parseLog(log);
        const orderParams = getOrderParams(args);
        const orderId = getOrderId(orderParams);

        cancelEventsOnChain.push({
          orderKind: "zora-v3",
          orderId,
          baseEventParams,
        });

        orderInfos.push({
          context: `cancelled-${orderId}-${baseEventParams.txHash}`,
          id: orderId,
          trigger: {
            kind: "cancel",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
            logIndex: baseEventParams.logIndex,
            batchIndex: baseEventParams.batchIndex,
            blockHash: baseEventParams.blockHash,
          },
        });

        break;
      }

      case "zora-ask-price-updated": {
        const { args } = eventData.abi.parseLog(log);
        const orderParams = getOrderParams(args);
        const seller = args["ask"]["seller"].toLowerCase();

        orders.push({
          orderParams: {
            seller,
            maker: seller,
            side: "sell",
            ...orderParams,
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          metadata: {},
        });

        break;
      }

      case "zora-auction-ended": {
        const { args } = eventData.abi.parseLog(log);
        const tokenId = args["tokenId"].toString();
        const tokenContract = args["tokenContract"].toLowerCase();
        const tokenOwner = args["tokenOwner"].toLowerCase();
        let taker = args["winner"].toLowerCase();
        const amount = args["amount"].toString();
        const curatorFee = args["curatorFee"].toString();
        const auctionCurrency = args["auctionCurrency"].toLowerCase();

        const price = bn(amount).add(curatorFee).toString();

        // Handle: attribution

        const orderKind = "zora-v3";
        const data = await utils.extractAttributionData(baseEventParams.txHash, orderKind);
        if (data.taker) {
          taker = data.taker;
        }

        // Handle: prices

        const prices = await getUSDAndNativePrices(
          auctionCurrency,
          price,
          baseEventParams.timestamp
        );
        if (!prices.nativePrice) {
          // We must always have the native price
          break;
        }

        fillEventsOnChain.push({
          orderKind,
          currency: auctionCurrency,
          orderSide: "sell",
          taker,
          maker: tokenOwner,
          price: prices.nativePrice,
          currencyPrice: price,
          usdPrice: prices.usdPrice,
          contract: tokenContract,
          tokenId,
          amount: "1",
          orderSourceId: data.orderSource?.id,
          aggregatorSourceId: data.aggregatorSource?.id,
          fillSourceId: data.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: `zora-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide: "sell",
          contract: tokenContract,
          tokenId,
          amount: "1",
          price: prices.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }
    }
  }

  return {
    fillEventsOnChain,
    cancelEventsOnChain,

    fillInfos,
    orderInfos,

    orders: orders.map((info) => ({
      kind: "zora-v3",
      info,
    })),
  };
};
