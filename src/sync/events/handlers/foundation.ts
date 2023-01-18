import * as Sdk from "@reservoir0x/sdk";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import * as foundation from "@/orderbook/orders/foundation";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "foundation-buy-price-set": {
        const parsedLog = eventData.abi.parseLog(log);
        const contract = parsedLog.args["nftContract"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();
        const maker = parsedLog.args["seller"].toLowerCase();
        const price = parsedLog.args["price"].toString();

        onChainData.orders.push({
          kind: "foundation",
          info: {
            orderParams: {
              contract,
              tokenId,
              maker,
              price,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
            },
            metadata: {},
          },
        });

        break;
      }

      case "foundation-buy-price-accepted": {
        const parsedLog = eventData.abi.parseLog(log);
        const contract = parsedLog.args["nftContract"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();
        const maker = parsedLog.args["seller"].toLowerCase();
        let taker = parsedLog.args["buyer"].toLowerCase();
        const protocolFee = parsedLog.args["protocolFee"].toString();

        const orderId = foundation.getOrderId(contract, tokenId);

        // Handle: attribution

        const orderKind = "foundation";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices

        const currency = Sdk.Common.Addresses.Eth[config.chainId];
        // Deduce the price from the protocol fee (which is 5%)
        const currencyPrice = bn(protocolFee).mul(10000).div(50).toString();
        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        onChainData.fillEventsOnChain.push({
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
          // Foundation only supports ERC721
          amount: "1",
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        onChainData.orderInfos.push({
          context: `filled-${orderId}-${baseEventParams.txHash}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        onChainData.fillInfos.push({
          context: `${orderId}-${baseEventParams.txHash}`,
          orderId: orderId,
          orderSide: "sell",
          contract,
          tokenId,
          amount: "1",
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });

        break;
      }

      case "foundation-buy-price-invalidated":
      case "foundation-buy-price-cancelled": {
        const parsedLog = eventData.abi.parseLog(log);
        const contract = parsedLog.args["nftContract"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();

        const orderId = foundation.getOrderId(contract, tokenId);

        onChainData.cancelEventsOnChain.push({
          orderKind: "foundation",
          orderId,
          baseEventParams,
        });

        onChainData.orderInfos.push({
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
    }
  }
};
