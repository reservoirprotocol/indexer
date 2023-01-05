import { Log } from "@ethersproject/abstract-provider";
import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { getERC20Transfer } from "@/events-sync/handlers/utils/erc20";
import { getUSDAndNativePrices } from "@/utils/prices";

import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const cancelEvents: es.cancels.Event[] = [];
  const bulkCancelEvents: es.bulkCancels.Event[] = [];
  const fillEventsPartial: es.fills.Event[] = [];

  const fillInfos: fillUpdates.FillInfo[] = [];
  const orderInfos: orderUpdatesById.OrderInfo[] = [];
  const makerInfos: orderUpdatesByMaker.MakerInfo[] = [];

  // Keep track of all events within the currently processing transaction
  let currentTx: string | undefined;
  let currentTxLogs: Log[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    if (currentTx !== baseEventParams.txHash) {
      currentTx = baseEventParams.txHash;
      currentTxLogs = [];
    }
    currentTxLogs.push(log);

    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "forward-order-filled": {
        const { args } = eventData.abi.parseLog(log);
        const orderId = args.orderHash.toLowerCase();
        const maker = args.maker.toLowerCase();
        let taker = args.taker.toLowerCase();
        const token = args.token.toLowerCase();
        const amount = args.filledAmount.toString();
        const identifier = args.identifier.toString();
        const unitPrice = args.unitPrice.toString();

        // Handle: attribution

        // Internal Forward listings have a different order kind so as
        // to have a unified validation logic (eg. escrowed orderbooks
        // need different validation)
        const orderKind = "forward";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices

        const currency = Sdk.Common.Addresses.Weth[config.chainId];
        const currencyPrice = unitPrice;
        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

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
          contract: token,
          tokenId: identifier,
          amount: amount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: `${orderId}-${baseEventParams.txHash}`,
          orderId: orderId,
          orderSide: "buy",
          contract: token,
          tokenId: identifier,
          amount: amount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        // If an ERC20 transfer occured in the same transaction as a sale
        // then we need resync the maker's ERC20 approval to the exchange
        const erc20 = getERC20Transfer(currentTxLogs);
        if (erc20) {
          makerInfos.push({
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
              orderKind: "seaport",
            },
          });
        }

        break;
      }

      case "forward-order-cancelled": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["orderHash"].toLowerCase();

        cancelEvents.push({
          orderKind: "forward",
          orderId,
          baseEventParams,
        });

        orderInfos.push({
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

      case "forward-counter-incremented": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["maker"].toLowerCase();
        const newCounter = parsedLog.args["newCounter"].toString();

        bulkCancelEvents.push({
          orderKind: "forward",
          maker,
          minNonce: newCounter,
          baseEventParams,
        });

        break;
      }
    }
  }

  return {
    cancelEvents,
    bulkCancelEvents,
    fillEventsPartial,

    fillInfos,
    orderInfos,
    makerInfos,
  };
};
