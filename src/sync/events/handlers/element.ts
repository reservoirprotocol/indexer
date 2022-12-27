import * as Sdk from "@reservoir0x/sdk";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";

import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const bulkCancelEvents: es.bulkCancels.Event[] = [];
  const nonceCancelEvents: es.nonceCancels.Event[] = [];
  const fillEventsPartial: es.fills.Event[] = [];

  const fillInfos: fillUpdates.FillInfo[] = [];
  const orderInfos: orderUpdatesById.OrderInfo[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    const eventData = getEventData([kind])[0];
    switch (kind) {
      // Element

      case "element-erc721-order-cancelled":
      case "element-erc1155-order-cancelled": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["maker"].toLowerCase();
        const nonce = parsedLog.args["nonce"].toString();

        nonceCancelEvents.push({
          orderKind: eventData!.kind.startsWith("element-erc721")
            ? "element-erc721"
            : "element-erc1155",
          maker,
          nonce,
          baseEventParams,
        });

        break;
      }

      case "element-hash-nonce-incremented": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["maker"].toLowerCase();
        const nonce = parsedLog.args["nonce"].toString();

        // Cancel all related orders across maker
        bulkCancelEvents.push({
          orderKind: "element-erc721",
          maker,
          minNonce: nonce,
          acrossAll: true,
          baseEventParams,
        });

        bulkCancelEvents.push({
          orderKind: "element-erc1155",
          maker,
          minNonce: nonce,
          acrossAll: true,
          baseEventParams: {
            ...baseEventParams,
            // Make sure unique in `bulk_cancel_events` table
            batchIndex: baseEventParams.batchIndex + 1,
          },
        });

        break;
      }

      case "element-erc721-sell-order-filled-v2":
      case "element-erc721-sell-order-filled": {
        const { args } = eventData.abi.parseLog(log);
        const maker = args["maker"].toLowerCase();
        let taker = args["taker"].toLowerCase();
        const erc20Token = args["erc20Token"].toLowerCase();
        const erc20TokenAmount = args["erc20TokenAmount"].toString();
        const erc721Token = args["erc721Token"].toLowerCase();
        const erc721TokenId = args["erc721TokenId"].toString();
        const orderId = args["orderHash"].toLowerCase();

        // Handle: attribution
        const orderKind = "element-erc721";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices
        let currency = erc20Token;
        if (currency === Sdk.ZeroExV4.Addresses.Eth[config.chainId]) {
          // Map the weird ZeroEx ETH address to the default ETH address
          currency = Sdk.Common.Addresses.Eth[config.chainId];
        }
        const currencyPrice = erc20TokenAmount;

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        orderInfos.push({
          context: `filled-${orderId}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        const orderSide = "sell";
        fillEventsPartial.push({
          orderKind,
          orderId,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: erc721Token,
          tokenId: erc721TokenId,
          amount: "1",
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: orderId,
          orderId: orderId,
          orderSide: "sell",
          contract: erc721Token,
          tokenId: erc721TokenId,
          amount: "1",
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }

      case "element-erc721-buy-order-filled-v2":
      case "element-erc721-buy-order-filled": {
        const { args } = eventData.abi.parseLog(log);
        const maker = args["maker"].toLowerCase();
        let taker = args["taker"].toLowerCase();
        const erc20Token = args["erc20Token"].toLowerCase();
        const erc20TokenAmount = args["erc20TokenAmount"].toString();
        const erc721Token = args["erc721Token"].toLowerCase();
        const erc721TokenId = args["erc721TokenId"].toString();
        const orderId = args["orderHash"].toLowerCase();

        // Handle: attribution
        const orderKind = "element-erc721";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );

        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices
        let currency = erc20Token;
        if (currency === Sdk.ZeroExV4.Addresses.Eth[config.chainId]) {
          // Map the weird ZeroEx ETH address to the default ETH address
          currency = Sdk.Common.Addresses.Eth[config.chainId];
        }
        const currencyPrice = erc20TokenAmount;

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        orderInfos.push({
          context: `filled-${orderId}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        fillInfos.push({
          context: orderId,
          orderId: orderId,
          orderSide: "buy",
          contract: erc721Token,
          tokenId: erc721TokenId,
          amount: "1",
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        fillEventsPartial.push({
          orderKind,
          orderId: orderId,
          orderSide: "sell",
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: erc721Token,
          tokenId: erc721TokenId,
          amount: "1",
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        break;
      }

      case "element-erc1155-sell-order-filled-v2":
      case "element-erc1155-sell-order-filled": {
        const { args } = eventData.abi.parseLog(log);
        const maker = args["maker"].toLowerCase();
        let taker = args["taker"].toLowerCase();
        const erc20Token = args["erc20Token"].toLowerCase();
        const erc20FillAmount = args["erc20FillAmount"].toString();
        const erc1155Token = args["erc1155Token"].toLowerCase();
        const erc1155TokenId = args["erc1155TokenId"].toString();
        const erc1155FillAmount = args["erc1155FillAmount"].toString();
        const orderId = args["orderHash"].toLowerCase();

        // Handle: attribution
        const orderKind = "element-erc1155";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices
        let currency = erc20Token;
        if (currency === Sdk.ZeroExV4.Addresses.Eth[config.chainId]) {
          // Map the weird ZeroEx ETH address to the default ETH address
          currency = Sdk.Common.Addresses.Eth[config.chainId];
        }
        const currencyPrice = bn(erc20FillAmount).div(erc1155FillAmount).toString();

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        orderInfos.push({
          context: `filled-${orderId}-${baseEventParams.txHash}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        fillEventsPartial.push({
          orderKind,
          orderId: orderId,
          orderSide: "sell",
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: erc1155Token,
          tokenId: erc1155TokenId,
          amount: erc1155FillAmount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: orderId,
          orderId: orderId,
          orderSide: "sell",
          contract: erc1155Token,
          tokenId: erc1155TokenId,
          amount: erc1155FillAmount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }

      case "element-erc1155-buy-order-filled-v2":
      case "element-erc1155-buy-order-filled": {
        const { args } = eventData.abi.parseLog(log);
        const maker = args["maker"].toLowerCase();
        let taker = args["taker"].toLowerCase();
        const erc20Token = args["erc20Token"].toLowerCase();
        const erc20FillAmount = args["erc20FillAmount"].toString();
        const erc1155Token = args["erc1155Token"].toLowerCase();
        const erc1155TokenId = args["erc1155TokenId"].toString();
        const erc1155FillAmount = args["erc1155FillAmount"].toString();
        const orderId = args["orderHash"].toLowerCase();

        // Handle: attribution

        const orderKind = "element-erc1155";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices

        let currency = erc20Token;
        if (currency === Sdk.ZeroExV4.Addresses.Eth[config.chainId]) {
          // Map the weird ZeroEx ETH address to the default ETH address
          currency = Sdk.Common.Addresses.Eth[config.chainId];
        }
        const currencyPrice = bn(erc20FillAmount).div(erc1155FillAmount).toString();

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        orderInfos.push({
          context: `filled-${orderId}-${baseEventParams.txHash}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        fillEventsPartial.push({
          orderKind,
          orderId,
          orderSide: "buy",
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: erc1155Token,
          tokenId: erc1155TokenId,
          amount: erc1155FillAmount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: orderId,
          orderId,
          orderSide: "buy",
          contract: erc1155Token,
          tokenId: erc1155TokenId,
          amount: erc1155FillAmount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }
    }
  }

  return {
    bulkCancelEvents,
    nonceCancelEvents,
    fillEventsPartial,

    fillInfos,
    orderInfos,
  };
};
