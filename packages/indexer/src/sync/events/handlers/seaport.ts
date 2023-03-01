import { Log } from "@ethersproject/abstract-provider";
import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getERC20Transfer } from "@/events-sync/handlers/utils/erc20";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Keep track of all events within the currently processing transaction
  let currentTx: string | undefined;
  let currentTxLogs: Log[] = [];

  const orderIdsToSkip = new Set<string>();

  // Only consider the first order of any explicit match
  for (const { log } of events.filter(({ subKind }) => subKind === "seaport-v1.4-orders-matched")) {
    const eventData = getEventData(["seaport-v1.4-orders-matched"])[0];
    const parsedLog = eventData.abi.parseLog(log);
    for (const orderId of parsedLog.args["orderHashes"].slice(1)) {
      orderIdsToSkip.add(orderId);
    }
  }

  // Handle the events
  let i = 0;
  for (const { subKind, baseEventParams, log } of events) {
    if (currentTx !== baseEventParams.txHash) {
      currentTx = baseEventParams.txHash;
      currentTxLogs = [];
    }
    currentTxLogs.push(log);

    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "seaport-order-cancelled":
      case "seaport-v1.4-order-cancelled": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["orderHash"].toLowerCase();

        const orderKind = subKind.startsWith("seaport-v1.4") ? "seaport-v1.4" : "seaport";
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

      case "seaport-counter-incremented":
      case "seaport-v1.4-counter-incremented": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["offerer"].toLowerCase();
        const newCounter = parsedLog.args["newCounter"].toString();

        const orderKind = subKind.startsWith("seaport-v1.4") ? "seaport-v1.4" : "seaport";
        onChainData.bulkCancelEvents.push({
          orderKind,
          maker,
          minNonce: newCounter,
          baseEventParams,
        });

        break;
      }

      case "seaport-order-filled":
      case "seaport-v1.4-order-filled": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["orderHash"].toLowerCase();
        const maker = parsedLog.args["offerer"].toLowerCase();
        let taker = parsedLog.args["recipient"].toLowerCase();
        const offer = parsedLog.args["offer"];
        const consideration = parsedLog.args["consideration"];

        if (orderIdsToSkip.has(orderId)) {
          break;
        }

        const orderKind = subKind.startsWith("seaport-v1.4") ? "seaport-v1.4" : "seaport";
        const exchange =
          orderKind === "seaport-v1.4"
            ? new Sdk.SeaportV14.Exchange(config.chainId)
            : new Sdk.Seaport.Exchange(config.chainId);

        const saleInfo = exchange.deriveBasicSale(offer, consideration);
        if (saleInfo) {
          // Handle: filling via `matchOrders`
          if (
            taker === AddressZero &&
            i + 1 < events.length &&
            events[i + 1].baseEventParams.txHash === baseEventParams.txHash &&
            events[i + 1].baseEventParams.logIndex === baseEventParams.logIndex + 1 &&
            events[i + 1].subKind === subKind
          ) {
            const parsedLog2 = eventData.abi.parseLog(events[i + 1].log);
            const offer2 = parsedLog2.args["offer"];
            if (
              offer2.length &&
              offer2[0].itemType === consideration[0].itemType &&
              offer2[0].token === consideration[0].token &&
              offer2[0].identifier.toString() === consideration[0].identifier.toString() &&
              offer2[0].amount.toString() === consideration[0].amount.toString()
            ) {
              taker = parsedLog2.args["offerer"].toLowerCase();
              orderIdsToSkip.add(parsedLog2.args["orderHash"]);
            }
          }

          // Handle: attribution
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

        onChainData.orderInfos.push({
          context: `filled-${orderId}-${baseEventParams.txHash}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        // If an ERC20 transfer occured in the same transaction as a sale
        // then we need resync the maker's ERC20 approval to the exchange
        const erc20 = getERC20Transfer(currentTxLogs);
        if (erc20) {
          onChainData.makerInfos.push({
            context: `${baseEventParams.txHash}-buy-approval`,
            maker,
            trigger: {
              kind: "approval-change",
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
            },
            data: {
              kind: "buy-approval",
              contract: erc20,
              orderKind,
            },
          });
        }

        break;
      }
    }

    i++;
  }
};
