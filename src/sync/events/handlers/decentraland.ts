import { Decentraland } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import * as es from "@/events-sync/storage";
import { getUSDAndNativePrices } from "@/utils/prices";

import * as fillUpdates from "@/jobs/fill-updates/queue";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const fillInfos: fillUpdates.FillInfo[] = [];
  const fillEvents: es.fills.Event[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "decentraland-sale": {
        const parsedLog = eventData.abi.parseLog(log);

        const tokenId = parsedLog.args["assetId"].toString();
        const contract = parsedLog.args["nftAddress"].toLowerCase();
        const price = parsedLog.args["totalPrice"].toString();
        const maker = parsedLog.args["seller"].toLowerCase();
        let taker = parsedLog.args["buyer"].toLowerCase();

        // Decentraland Exchange works only with ERC721
        const amount = "1";
        const orderSide = "sell";

        // Decentraland Exchange works only with MANA
        const currency = Decentraland.Addresses.ExchangeCurrency[config.chainId];

        // Handle: prices
        const priceData = await getUSDAndNativePrices(currency, price, baseEventParams.timestamp);

        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        // Handle: attribution
        const orderKind = "decentraland";
        const data = await utils.extractAttributionData(baseEventParams.txHash, orderKind);

        if (data.taker) {
          taker = data.taker;
        }

        fillEvents.push({
          orderKind,
          currency,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currencyPrice: price,
          usdPrice: priceData.usdPrice,
          contract,
          tokenId,
          amount,
          orderSourceId: data.orderSource?.id,
          aggregatorSourceId: data.aggregatorSource?.id,
          fillSourceId: data.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: `decentraland-${contract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide,
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
    fillInfos,
    fillEvents,
  };
};
