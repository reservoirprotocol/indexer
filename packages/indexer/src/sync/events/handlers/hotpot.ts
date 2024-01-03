import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { OrderKind } from "@/orderbook/orders";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { getUSDAndNativePrices } from "@/utils/prices";
import { bn } from "@/common/utils";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    const orderKind = "hotpot" as OrderKind;

    switch (subKind) {
      case "hotpot-order-filled": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["offerer"].toLowerCase();
        let taker = parsedLog.args["receiver"].toLowerCase();
        const token = parsedLog.args["offerToken"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();
        const orderId = parsedLog.args["orderHash"].toLowerCase();
        const price = parsedLog.args["tradeAmount"].toString();
        const amount = parsedLog.args["tokenAmount"].toString();

        // Handle: attribution
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle prices
        const currency = Sdk.Common.Addresses.Native[config.chainId];
        const currencyPrice = bn(price).div(amount).toString();
        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderSide = "sell";
        onChainData.fillEventsPartial.push({
          orderKind,
          orderId,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: token,
          tokenId: tokenId,
          amount: amount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        onChainData.fillInfos.push({
          context: orderId,
          orderId: orderId,
          orderSide,
          contract: token,
          tokenId: tokenId,
          amount: amount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });

        onChainData.orderInfos.push({
          context: `filled-${orderId}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        break;
      }
      case "hotpot-order-cancelled": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["orderHash"].toLowerCase();

        onChainData.cancelEvents.push({
          orderKind,
          orderId,
          baseEventParams,
        });

        onChainData.orderInfos.push({
          context: `cancelled-${orderId}`,
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
};
