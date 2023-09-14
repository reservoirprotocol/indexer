import { Log } from "@ethersproject/abstract-provider";
import { HashZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";

import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const handleEvents = async (_events: EnhancedEvent[], onChainData: OnChainData) => {
  const nftTransferEvents: es.nftTransfers.Event[] = [];

  // re-sort
  const events = _events.sort((a, b) => a.baseEventParams.logIndex - b.baseEventParams.logIndex);

  // Keep track of all events within the currently processing transaction
  let currentTx: string | undefined;
  let currentTxLogs: Log[] = [];

  // TODO: Re-enable and use call tracing to properly parse sales

  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    if (currentTx !== baseEventParams.txHash) {
      currentTx = baseEventParams.txHash;
      currentTxLogs = [];
    }
    currentTxLogs.push(log);

    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      // Wyvern v2 / v2.3 are both decomissioned, but we still keep handling
      // fill events from them in order to get historical sales. Relevant to
      // backfilling only.

      case "wyvern-v2-orders-matched":
      case "wyvern-v2.3-orders-matched": {
        const parsedLog = eventData.abi.parseLog(log);
        let buyOrderId = parsedLog.args["buyHash"].toLowerCase();
        const sellOrderId = parsedLog.args["sellHash"].toLowerCase();
        const maker = parsedLog.args["maker"].toLowerCase();
        let taker = parsedLog.args["taker"].toLowerCase();
        let currencyPrice = parsedLog.args["price"].toString();

        // With Wyvern, there are two main issues:
        // - the traded token is not included in the fill event, so we have
        // to deduce it by checking the nft transfer occured exactly before
        // the fill event
        // - the payment token is not included in the fill event, and we deduce
        // it as well by checking any ERC20 transfers that occured close before
        // the fill event (and default to the native token if cannot find any)

        // Detect the traded token
        let associatedNftTransferEvent: es.nftTransfers.Event | undefined;
        if (nftTransferEvents.length) {
          // Ensure the last NFT transfer event was part of the fill
          const event = nftTransferEvents[nftTransferEvents.length - 1];
          if (
            event.baseEventParams.txHash === baseEventParams.txHash &&
            event.baseEventParams.logIndex === baseEventParams.logIndex - 1 &&
            // Only single token fills are supported and recognized
            event.baseEventParams.batchIndex === 1
          ) {
            associatedNftTransferEvent = event;
            currencyPrice = bn(currencyPrice).div(event.amount).toString();
          }
        }

        if (!associatedNftTransferEvent) {
          // Skip if we can't associate to an NFT transfer event
          break;
        }

        // Detect the payment token
        let currency = Sdk.Common.Addresses.Native[config.chainId];
        for (const log of currentTxLogs.slice(0, -1).reverse()) {
          // Skip once we detect another fill in the same transaction
          // (this will happen if filling through an aggregator)
          if (log.topics[0] === getEventData([eventData.subKind])[0].topic) {
            break;
          }

          // If we detect an ERC20 transfer as part of the same transaction
          // then we assume it's the payment for the current sale
          const erc20EventData = getEventData(["erc20-transfer"])[0];
          if (
            log.topics[0] === erc20EventData.topic &&
            log.topics.length === erc20EventData.numTopics
          ) {
            const parsed = erc20EventData.abi.parseLog(log);
            const from = parsed.args["from"].toLowerCase();
            const to = parsed.args["to"].toLowerCase();
            const amount = parsed.args["amount"].toString();
            if (
              ((maker === from && taker === to) || (maker === to && taker === from)) &&
              amount <= currencyPrice
            ) {
              currency = log.address.toLowerCase();
              break;
            }
          }
        }

        // Handle: attribution

        const orderKind = subKind === "wyvern-v2.3-orders-matched" ? "wyvern-v2.3" : "wyvern-v2";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId: buyOrderId }
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

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

        // Do not double-count explicit order matching
        if (buyOrderId !== HashZero && sellOrderId !== HashZero) {
          buyOrderId = HashZero;
        }

        if (buyOrderId !== HashZero) {
          // onChainData.fillEvents.push({
          //   orderKind,
          //   orderId: buyOrderId,
          //   orderSide: "buy",
          //   maker,
          //   taker,
          //   price: priceData.nativePrice,
          //   currency,
          //   currencyPrice,
          //   usdPrice: priceData.usdPrice,
          //   contract: associatedNftTransferEvent.baseEventParams.address,
          //   tokenId: associatedNftTransferEvent.tokenId,
          //   amount: associatedNftTransferEvent.amount,
          //   orderSourceId: attributionData.orderSource?.id,
          //   aggregatorSourceId: attributionData.aggregatorSource?.id,
          //   fillSourceId: attributionData.fillSource?.id,
          //   baseEventParams,
          // });
          // onChainData.fillInfos.push({
          //   context: `${buyOrderId}-${baseEventParams.txHash}`,
          //   orderId: buyOrderId,
          //   orderSide: "buy",
          //   contract: associatedNftTransferEvent.baseEventParams.address,
          //   tokenId: associatedNftTransferEvent.tokenId,
          //   amount: associatedNftTransferEvent.amount,
          //   price: priceData.nativePrice,
          //   timestamp: baseEventParams.timestamp,
          //   maker,
          //   taker,
          // });
        }

        if (sellOrderId !== HashZero) {
          // onChainData.fillEvents.push({
          //   orderKind,
          //   orderId: sellOrderId,
          //   orderSide: "sell",
          //   maker,
          //   taker,
          //   price: priceData.nativePrice,
          //   currency,
          //   currencyPrice,
          //   usdPrice: priceData.usdPrice,
          //   contract: associatedNftTransferEvent.baseEventParams.address,
          //   tokenId: associatedNftTransferEvent.tokenId,
          //   amount: associatedNftTransferEvent.amount,
          //   orderSourceId: attributionData.orderSource?.id,
          //   aggregatorSourceId: attributionData.aggregatorSource?.id,
          //   fillSourceId: attributionData.fillSource?.id,
          //   baseEventParams,
          // });
          // onChainData.fillInfos.push({
          //   context: `${sellOrderId}-${baseEventParams.txHash}`,
          //   orderId: sellOrderId,
          //   orderSide: "sell",
          //   contract: associatedNftTransferEvent.baseEventParams.address,
          //   tokenId: associatedNftTransferEvent.tokenId,
          //   amount: associatedNftTransferEvent.amount,
          //   price: priceData.nativePrice,
          //   timestamp: baseEventParams.timestamp,
          //   maker,
          //   taker,
          // });
        }

        break;
      }

      case "erc721-transfer": {
        const parsedLog = eventData.abi.parseLog(log);
        const from = parsedLog.args["from"].toLowerCase();
        const to = parsedLog.args["to"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();

        nftTransferEvents.push({
          kind: "erc721",
          from,
          to,
          tokenId,
          amount: "1",
          baseEventParams,
        });

        break;
      }

      case "erc1155-transfer-single": {
        const parsedLog = eventData.abi.parseLog(log);
        const from = parsedLog.args["from"].toLowerCase();
        const to = parsedLog.args["to"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();
        const amount = parsedLog.args["amount"].toString();

        nftTransferEvents.push({
          kind: "erc1155",
          from,
          to,
          tokenId,
          amount,
          baseEventParams,
        });

        break;
      }
    }
  }
};
