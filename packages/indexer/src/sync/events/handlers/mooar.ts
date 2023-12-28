import * as Sdk from "@reservoir0x/sdk";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "mooar-order-filled": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["orderHash"].toLowerCase();
        const maker = parsedLog.args["offerer"].toLowerCase();
        let taker = parsedLog.args["recipient"].toLowerCase();
        const offer = parsedLog.args["offer"];
        const consideration = parsedLog.args["consideration"];

        const saleInfo = new Sdk.SeaportV11.Exchange(config.chainId).deriveBasicSale(
          offer,
          consideration
        );
        if (saleInfo) {
          // Handle: attribution

          const orderKind = "mooar";
          const attributionData = await utils.extractAttributionData(
            baseEventParams.txHash,
            orderKind,
            { orderId }
          );
          if (attributionData.taker) {
            taker = attributionData.taker;
          }

          if (saleInfo.recipientOverride) {
            taker = saleInfo.recipientOverride;
          }

          // Handle: prices

          const currency = saleInfo.paymentToken;
          const currencyPrice = bn(saleInfo.price).div(saleInfo.amount).toString();
          const priceData = await getUSDAndNativePrices(
            currency,
            currencyPrice,
            baseEventParams.timestamp
          );

          if (!priceData.nativePrice) {
            // We must always have the native price
            break;
          }

          const orderSide = saleInfo.side as "sell" | "buy";
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
            contract: saleInfo.contract,
            tokenId: saleInfo.tokenId,
            amount: saleInfo.amount,
            orderSourceId: attributionData.orderSource?.id,
            aggregatorSourceId: attributionData.aggregatorSource?.id,
            fillSourceId: attributionData.fillSource?.id,
            baseEventParams,
          });

          onChainData.fillInfos.push({
            context: `${orderId}-${baseEventParams.txHash}`,
            orderId: orderId,
            orderSide,
            contract: saleInfo.contract,
            tokenId: saleInfo.tokenId,
            amount: saleInfo.amount,
            price: priceData.nativePrice,
            timestamp: baseEventParams.timestamp,
            maker,
            taker,
          });
        }

        break;
      }
    }
  }
};
