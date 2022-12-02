import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import * as fillUpdates from "@/jobs/fill-updates/queue";
import { getUSDAndNativePrices } from "@/utils/prices";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const fillEvents: es.fills.Event[] = [];
  const bulkCancelEvents: es.bulkCancels.Event[] = [];
  const nonceCancelEvents: es.nonceCancels.Event[] = [];
  const cancelEvents: es.cancels.Event[] = [];

  const fillInfos: fillUpdates.FillInfo[] = [];
  const orderInfos: orderUpdatesById.OrderInfo[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "blur-orders-matched": {
        const { args } = eventData.abi.parseLog(log);
        let maker = args.maker.toLowerCase();
        let taker = args.taker.toLowerCase();
        const sell = args.sell;
        const sellHash = args.sellHash.toLowerCase();
        const buyHash = args.buyHash.toLowerCase();

        const routers = Sdk.Common.Addresses.Routers[config.chainId];
        if (maker in routers) {
          maker = sell.trader.toLowerCase();
        }

        // Handle: attribution
        const orderKind = "blur";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }
        // Handle: prices

        const currency = sell.paymentToken.toLowerCase();
        const currencyPrice = sell.price.div(sell.amount).toString();
        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderSide = maker === sell.trader.toLowerCase() ? "sell" : "buy";
        const orderId = orderSide === "sell" ? sellHash : buyHash;

        orderInfos.push({
          context: `filled-${orderId}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        fillEvents.push({
          orderKind,
          orderId,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: sell.collection.toLowerCase(),
          tokenId: sell.tokenId.toString(),
          amount: sell.amount.toString(),
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: `${orderId}-${baseEventParams.txHash}`,
          orderId: orderId,
          orderSide,
          contract: sell.collection.toLowerCase(),
          tokenId: sell.tokenId.toString(),
          amount: sell.amount.toString(),
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }

      case "blur-order-cancelled": {
        const { args } = eventData.abi.parseLog(log);
        const orderId = args.hash.toLowerCase();

        cancelEvents.push({
          orderKind: "blur",
          orderId,
          baseEventParams,
        });

        break;
      }

      case "blur-nonce-incremented": {
        const { args } = eventData.abi.parseLog(log);
        const maker = args.trader.toLowerCase();
        const nonce = args.newNonce.toString();

        bulkCancelEvents.push({
          orderKind: "blur",
          maker,
          minNonce: nonce,
          baseEventParams,
        });

        break;
      }
    }
  }

  return {
    cancelEvents,
    bulkCancelEvents,
    nonceCancelEvents,

    fillEvents,
    fillInfos,

    orderInfos,
  };
};
