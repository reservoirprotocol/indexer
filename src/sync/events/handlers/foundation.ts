import * as Sdk from "@reservoir0x/sdk";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import * as foundation from "@/orderbook/orders/foundation";
import { getUSDAndNativePrices } from "@/utils/prices";

import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const cancelEventsOnChain: es.cancels.Event[] = [];
  const fillEventsOnChain: es.fills.Event[] = [];

  const fillInfos: fillUpdates.FillInfo[] = [];
  const orderInfos: orderUpdatesById.OrderInfo[] = [];

  // Keep track of any on-chain orders
  const orders: foundation.OrderInfo[] = [];

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

        orders.push({
          orderParams: {
            contract,
            tokenId,
            maker,
            price,
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
          metadata: {},
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

        fillEventsOnChain.push({
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
          contract,
          tokenId,
          amount: "1",
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }

      case "foundation-buy-price-invalidated":
      case "foundation-buy-price-cancelled": {
        const parsedLog = eventData.abi.parseLog(log);
        const contract = parsedLog.args["nftContract"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();

        const orderId = foundation.getOrderId(contract, tokenId);

        cancelEventsOnChain.push({
          orderKind: "foundation",
          orderId,
          baseEventParams,
        });

        orderInfos.push({
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

  return {
    cancelEventsOnChain,
    fillEventsOnChain,

    fillInfos,

    orders: orders.map((info) => ({
      kind: "foundation",
      info,
    })),
  };
};
