import { AddressZero } from "@ethersproject/constants";
import { getStateChange } from "@georgeroman/evm-tx-simulator";
import { Common } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { bn } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import * as superrare from "@/orderbook/orders/superrare";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "superrare-listing-filled": {
        const { args } = eventData.abi.parseLog(log);
        const contract = args["_originContract"].toLowerCase();
        const taker = args["_buyer"].toLowerCase();
        const maker = args["_seller"].toLowerCase();
        const currencyPrice = args["_amount"].toString();
        const tokenId = args["_tokenId"].toString();

        const orderId = superrare.getOrderId(contract, tokenId);

        // Superrare works only with ERC721
        const amount = "1";
        const orderSide = "sell";
        let currency = Common.Addresses.Native[config.chainId];

        const txTrace = await utils.fetchTransactionTrace(baseEventParams.txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        const state = getStateChange(txTrace.calls);

        for (const token of Object.keys(state[taker].tokenBalanceState)) {
          if (token.startsWith("erc20") || token.startsWith("native")) {
            currency = token.split(":")[1];
          }
        }

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice.toString(),
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderKind = "superrare";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        onChainData.fillEventsOnChain.push({
          orderKind,
          orderId,
          currency,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
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
          context: `superrare-${contract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide,
          orderId,
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

      case "superrare-sold": {
        const { args } = eventData.abi.parseLog(log);
        const contract = args["_originContract"].toLowerCase();
        const taker = args["_buyer"].toLowerCase();
        const maker = args["_seller"].toLowerCase();
        const currency = args["_currencyAddress"].toLowerCase();
        const currencyPrice = args["_amount"].toString();
        const tokenId = args["_tokenId"].toString();

        const orderId = superrare.getOrderId(contract, tokenId);

        // Superrare works only with ERC721
        const amount = "1";
        const orderSide = "sell";

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice.toString(),
          baseEventParams.timestamp
        );

        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderKind = "superrare";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        onChainData.fillEventsOnChain.push({
          orderKind,
          orderId,
          currency,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
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
          context: `superrare-${contract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide,
          orderId,
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

      case "superrare-accept-offer": {
        const { args } = eventData.abi.parseLog(log);
        const contract = args["_originContract"].toLowerCase();
        const maker = args["_bidder"].toLowerCase();
        const taker = args["_seller"].toLowerCase();
        const currency = args["_currencyAddress"].toLowerCase();
        const currencyPrice = args["_amount"].toString();
        const tokenId = args["_tokenId"].toString();

        const orderId = superrare.getOrderId(contract, tokenId);

        // Superrare works only with ERC721
        const amount = "1";
        const orderSide = "buy";

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice.toString(),
          baseEventParams.timestamp
        );

        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderKind = "superrare";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        onChainData.fillEventsOnChain.push({
          orderKind,
          orderId,
          currency,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
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
          context: `superrare-${contract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide,
          orderId,
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

      case "superrare-auction-settled": {
        const { args } = eventData.abi.parseLog(log);
        const contract = args["_contractAddress"].toLowerCase();
        const taker = args["_bidder"].toLowerCase();
        const maker = args["_seller"].toLowerCase();
        const currency = args["_currencyAddress"].toLowerCase();
        const currencyPrice = args["_amount"].toString();
        const tokenId = args["_tokenId"].toString();

        // Skip empty auctions
        if (maker === AddressZero || taker === AddressZero) {
          break;
        }

        const orderId = superrare.getOrderId(contract, tokenId);

        // Superrare works only with ERC721
        const amount = "1";
        const orderSide = "sell";

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice.toString(),
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderKind = "superrare";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        onChainData.fillEventsOnChain.push({
          orderKind,
          orderId,
          currency,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
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
          context: `superrare-${contract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide,
          orderId,
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

      // Create/cancel order event
      case "superrare-set-sale-price": {
        const parsedLog = eventData.abi.parseLog(log);
        const contract = parsedLog.args["_originContract"].toLowerCase();
        const tokenId = parsedLog.args["_tokenId"].toString();
        const price = parsedLog.args["_amount"].toString();
        const maker = parsedLog.args["_splitRecipients"][0].toLowerCase();
        const currency = parsedLog.args["_currencyAddress"].toLowerCase();
        const splitAddresses = parsedLog.args["_splitRecipients"];
        const splitRatios = parsedLog.args["_splitRatios"];

        if (bn(price).gt(0)) {
          onChainData.orders.push({
            kind: "superrare",
            info: {
              orderParams: {
                contract,
                tokenId,
                maker,
                price,
                currency,
                splitAddresses,
                splitRatios,
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
                txBlock: baseEventParams.block,
                logIndex: baseEventParams.logIndex,
              },
              metadata: {},
            },
          });
          // In case the price is 0 this treated as a cancel event
        } else {
          const orderId = superrare.getOrderId(contract, tokenId);

          onChainData.cancelEventsOnChain.push({
            orderKind: "superrare",
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
        }

        break;
      }
    }
  }
};
