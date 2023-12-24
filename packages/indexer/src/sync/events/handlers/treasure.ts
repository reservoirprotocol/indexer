import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "treasure-item-sold": {
        const { args } = eventData.abi.parseLog(log);
        const maker = args["seller"].toLowerCase();
        const taker = args["buyer"].toLowerCase();
        const currency = args["paymentToken"];
        const tokenId = args["tokenId"];
        const tokenContract = args["nftAddress"];
        const currencyPrice = args["pricePerItem"];
        const amount = args["quantity"];

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice.toString(),
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderKind = "treasure";
        const orderSide = "sell";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        onChainData.fillEvents.push({
          orderKind,
          currency,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currencyPrice: currencyPrice.toString(),
          usdPrice: priceData.usdPrice,
          contract: tokenContract,
          tokenId: tokenId.toString(),
          amount: amount.toString(),
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        onChainData.fillInfos.push({
          context: `treasure-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide,
          contract: tokenContract,
          tokenId: tokenId.toString(),
          amount: amount.toString(),
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });

        break;
      }

      case "treasure-bid-accepted": {
        const { args } = eventData.abi.parseLog(log);
        const maker = args["bidder"].toLowerCase();
        const taker = args["seller"].toLowerCase();
        const currency = args["paymentToken"].toLowerCase();
        const tokenId = args["tokenId"].toString();
        const tokenContract = args["nftAddress"].toLowerCase();
        const currencyPrice = args["pricePerItem"].toString();
        const amount = args["quantity"].toString();

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice.toString(),
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderKind = "treasure";
        const orderSide = "buy";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        onChainData.fillEvents.push({
          orderKind,
          currency,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currencyPrice: currencyPrice.toString(),
          usdPrice: priceData.usdPrice,
          contract: tokenContract,
          tokenId: tokenId.toString(),
          amount: amount.toString(),
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        onChainData.fillInfos.push({
          context: `treasure-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide,
          contract: tokenContract,
          tokenId: tokenId.toString(),
          amount: amount.toString(),
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });
      }
    }
  }
};
