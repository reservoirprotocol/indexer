import { Log } from "@ethersproject/abstract-provider";

import { bn } from "@/common/utils";
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
  const bulkCancelEvents: es.bulkCancels.Event[] = [];
  const nonceCancelEvents: es.nonceCancels.Event[] = [];
  const fillEvents: es.fills.Event[] = [];

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
      case "looks-rare-cancel-all-orders": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["user"].toLowerCase();
        const newMinNonce = parsedLog.args["newMinNonce"].toString();

        bulkCancelEvents.push({
          orderKind: "looks-rare",
          maker,
          minNonce: newMinNonce,
          baseEventParams,
        });

        break;
      }

      case "looks-rare-cancel-multiple-orders": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["user"].toLowerCase();
        const orderNonces = parsedLog.args["orderNonces"].map(String);

        let batchIndex = 1;
        for (const orderNonce of orderNonces) {
          nonceCancelEvents.push({
            orderKind: "looks-rare",
            maker,
            nonce: orderNonce,
            baseEventParams: {
              ...baseEventParams,
              batchIndex: batchIndex++,
            },
          });
        }

        break;
      }

      case "looks-rare-taker-ask": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["orderHash"].toLowerCase();
        const orderNonce = parsedLog.args["orderNonce"].toString();
        const maker = parsedLog.args["maker"].toLowerCase();
        let taker = parsedLog.args["taker"].toLowerCase();
        const currency = parsedLog.args["currency"].toLowerCase();
        let currencyPrice = parsedLog.args["price"].toString();
        const contract = parsedLog.args["collection"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();
        const amount = parsedLog.args["amount"].toString();

        // Handle: attribution

        const orderKind = "looks-rare";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices

        currencyPrice = bn(currencyPrice).div(amount).toString();
        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        fillEvents.push({
          orderKind,
          orderId,
          orderSide: "buy",
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
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

        // Cancel all the other orders of the maker having the same nonce
        nonceCancelEvents.push({
          orderKind: "looks-rare",
          maker,
          nonce: orderNonce,
          baseEventParams,
        });

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
          contract,
          tokenId,
          amount,
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
              orderKind: "looks-rare",
            },
          });
        }

        break;
      }

      case "looks-rare-taker-bid": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["orderHash"].toLowerCase();
        const orderNonce = parsedLog.args["orderNonce"].toString();
        const maker = parsedLog.args["maker"].toLowerCase();
        let taker = parsedLog.args["taker"].toLowerCase();
        const currency = parsedLog.args["currency"].toLowerCase();
        let currencyPrice = parsedLog.args["price"].toString();
        const contract = parsedLog.args["collection"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();
        const amount = parsedLog.args["amount"].toString();

        // Handle: attribution

        const orderKind = "looks-rare";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices

        currencyPrice = bn(currencyPrice).div(amount).toString();
        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        fillEvents.push({
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
          amount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        // Cancel all the other orders of the maker having the same nonce
        nonceCancelEvents.push({
          orderKind: "looks-rare",
          maker,
          nonce: orderNonce,
          baseEventParams,
        });

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
          orderSide: "sell",
          contract,
          tokenId,
          amount,
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
              orderKind: "looks-rare",
            },
          });
        }

        break;
      }
    }
  }

  return {
    bulkCancelEvents,
    nonceCancelEvents,
    fillEvents,

    fillInfos,
    orderInfos,
    makerInfos,
  };
};
