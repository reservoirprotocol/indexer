import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { getUSDAndNativePrices } from "@/utils/prices";
import * as utils from "@/events-sync/utils";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "joepeg-taker-ask":
      case "joepeg-taker-bid": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderHash = parsedLog.args["orderHash"].toLowerCase();
        const orderSide = subKind === "joepeg-taker-ask" ? "buy" : "sell";
        let taker = parsedLog.args["taker"].toLowerCase();
        const maker = parsedLog.args["maker"].toLowerCase();
        const currency = parsedLog.args["currency"].toLowerCase();
        const collection = parsedLog.args["collection"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();
        const amount = parsedLog.args["amount"].toString();
        const currencyPrice = parsedLog.args["price"].div(parsedLog.args["amount"]).toString();

        // Handle: prices
        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        // Handle: attribution
        const orderKind = "joepeg";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        onChainData.fillEvents.push({
          orderId: orderHash,
          orderKind,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: collection,
          tokenId: tokenId,
          amount: amount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        break;
      }
    }
  }
};
