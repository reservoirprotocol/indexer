import { bn } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
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
          orderKind,
          { orderId }
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

        onChainData.fillEvents.push({
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

        onChainData.fillInfos.push({
          context: orderId,
          orderId: orderId,
          orderSide: "buy",
          contract,
          tokenId,
          amount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
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
          orderKind,
          { orderId }
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

        onChainData.fillEvents.push({
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

        onChainData.fillInfos.push({
          context: orderId,
          orderId: orderId,
          orderSide: "sell",
          contract,
          tokenId,
          amount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });

        break;
      }
    }
  }
};
