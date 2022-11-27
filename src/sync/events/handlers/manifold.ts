import { Log } from "@ethersproject/abstract-provider";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

import { getEventData } from "@/events-sync/data";
import { bn } from "@/common/utils";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";

import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import { getOrderId, OrderInfo } from "@/orderbook/orders/manifold";
import { manifold } from "@/orderbook/orders";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const cancelEventsOnChain: es.cancels.Event[] = [];
  const fillEventsOnChain: es.fills.Event[] = [];
  const fillEventsPartial: es.fills.Event[] = [];

  const fillInfos: fillUpdates.FillInfo[] = [];
  const orderInfos: orderUpdatesById.OrderInfo[] = [];
  const makerInfos: orderUpdatesByMaker.MakerInfo[] = [];

  // Keep track of any on-chain orders
  const orders: OrderInfo[] = [];

  // Keep track of all events within the currently processing transaction
  let currentTx: string | undefined;
  let currentTxLogs: Log[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    if (currentTx !== baseEventParams.txHash) {
      currentTx = baseEventParams.txHash;
      currentTxLogs = [];
    }
    currentTxLogs.push(log);

    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "manifold-cancel": {
        const { args } = eventData.abi.parseLog(log);
        const listingId = args["listingId"];
        const orderId = getOrderId(listingId);

        cancelEventsOnChain.push({
          orderKind: "manifold",
          orderId,
          baseEventParams,
        });

        orderInfos.push({
          context: `cancelled-${orderId}-${baseEventParams.txHash}-${Math.random()}`,
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

      case "manifold-purchase": {
        const parsedLog = eventData.abi.parseLog(log);
        const listingId = parsedLog.args["listingId"].toString();
        let taker = parsedLog.args["buyer"].toLowerCase();
        const price = parsedLog.args["amount"].toString();
        const amount = parsedLog.args["count"];

        const orderId = manifold.getOrderId(listingId);

        // Handle: attribution

        const orderKind = "manifold";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices

        const currency = Sdk.Common.Addresses.Eth[config.chainId];
        const priceData = await getUSDAndNativePrices(currency, price, baseEventParams.timestamp);
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        fillEventsOnChain.push({
          orderKind,
          orderId,
          orderSide: "sell",
          maker: "",
          taker,
          price: priceData.nativePrice,
          currency,
          // currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: "",
          tokenId: "",
          amount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        orderInfos.push({
          context: `filled-${orderId}-${baseEventParams.txHash}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        fillInfos.push({
          context: `${orderId}-${baseEventParams.txHash}`,
          orderId: orderId,
          orderSide: "sell",
          contract: "",
          tokenId: "",
          amount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }

      case "manifold-modify": {
        const { args } = eventData.abi.parseLog(log);
        const listingId = args["listingId"];
        const initialAmount = args["initialAmount"].toString();
        const startTime = args["startTime"];
        const endTime = args["endTime"];

        // Manifold doesn't provide full order info. `any` helps us overcome the type differences.
        // If we don' want to use `any` we'd have to specify some default values for the whole struct
        orders.push({
          orderParams: {
            id: listingId,
            details: {
              startTime,
              endTime,
              initialAmount,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          metadata: {},
        });

        break;
      }

      case "manifold-finalize": {
        const { args } = eventData.abi.parseLog(log);
        const listingId = args["listingId"];
        const orderId = getOrderId(listingId);

        orderInfos.push({
          context: `cancelled-${orderId}-${baseEventParams.txHash}-${Math.random()}`,
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
    }
  }

  return {
    cancelEventsOnChain,
    fillEventsPartial,

    fillInfos,
    orderInfos,
    makerInfos,
    orders: orders.map((info) => ({
      kind: "manifold",
      info,
    })),
  };
};
