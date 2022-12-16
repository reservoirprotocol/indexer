import { bn } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";

import * as fillUpdates from "@/jobs/fill-updates/queue";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const fillEvents: es.fills.Event[] = [];
  const fillInfos: fillUpdates.FillInfo[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "bend-dao-taker-ask": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["orderHash"].toLowerCase();
        const maker = parsedLog.args["maker"].toLowerCase();
        let taker = parsedLog.args["taker"].toLowerCase();
        const currency = parsedLog.args["currency"].toLowerCase();
        let currencyPrice = parsedLog.args["price"].toString();
        const contract = parsedLog.args["collection"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();
        const amount = parsedLog.args["amount"].toString();

        // Handle: attribution
        const orderKind = "bend-dao";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices
        currencyPrice = bn(currencyPrice).div(amount).toString();
        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        fillEvents.push({
          orderKind,
          orderId,
          orderSide: "buy",
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract,
          tokenId,
          amount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: orderId,
          orderId: orderId,
          orderSide: "buy",
          contract,
          tokenId,
          amount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }

      case "bend-dao-taker-bid": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["orderHash"].toLowerCase();
        const maker = parsedLog.args["maker"].toLowerCase();
        let taker = parsedLog.args["taker"].toLowerCase();
        const currency = parsedLog.args["currency"].toLowerCase();
        let currencyPrice = parsedLog.args["price"].toString();
        const contract = parsedLog.args["collection"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();
        const amount = parsedLog.args["amount"].toString();

        // Handle: attribution
        const orderKind = "bend-dao";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices

        currencyPrice = bn(currencyPrice).div(amount).toString();
        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        fillEvents.push({
          orderKind,
          orderId,
          orderSide: "sell",
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract,
          tokenId,
          amount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: orderId,
          orderId: orderId,
          orderSide: "sell",
          contract,
          tokenId,
          amount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }
    }
  }

  return {
    fillEvents,
    fillInfos,
  };
};
