import { defaultAbiCoder } from "@ethersproject/abi";
import { Log } from "@ethersproject/abstract-provider";
import * as Sdk from "@reservoir0x/sdk";

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
      case "x2y2-order-cancelled": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["itemHash"].toLowerCase();

        cancelEvents.push({
          orderKind: "x2y2",
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

      case "x2y2-order-inventory": {
        const parsedLog = eventData.abi.parseLog(log);
        const orderId = parsedLog.args["itemHash"].toLowerCase();
        const maker = parsedLog.args["maker"].toLowerCase();
        let taker = parsedLog.args["taker"].toLowerCase();
        const currency = parsedLog.args["currency"].toLowerCase();
        const item = parsedLog.args["item"];
        const op = parsedLog.args["detail"].op;

        if (
          ![
            Sdk.X2Y2.Types.Op.COMPLETE_SELL_OFFER,
            Sdk.X2Y2.Types.Op.COMPLETE_BUY_OFFER,
            Sdk.X2Y2.Types.Op.COMPLETE_AUCTION,
          ].includes(op)
        ) {
          // Skip any irrelevant events
          break;
        }

        // Handle: attribution

        const orderKind = "x2y2";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices

        const currencyPrice = item.price.toString();
        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        // Decode the sold token (ignoring bundles)
        let contract: string;
        let tokenId: string;
        try {
          const decodedItems = defaultAbiCoder.decode(
            ["(address contract, uint256 tokenId)[]"],
            item.data
          );
          if (decodedItems[0].length !== 1) {
            break;
          }

          contract = decodedItems[0][0].contract.toLowerCase();
          tokenId = decodedItems[0][0].tokenId.toString();
        } catch {
          break;
        }

        const orderSide = [
          Sdk.X2Y2.Types.Op.COMPLETE_SELL_OFFER,
          Sdk.X2Y2.Types.Op.COMPLETE_AUCTION,
        ].includes(op)
          ? "sell"
          : "buy";

        fillEvents.push({
          orderKind,
          orderId,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract,
          tokenId,
          // TODO: Support X2Y2 ERC1155 orders
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
          orderSide,
          contract,
          tokenId,
          amount: "1",
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
              orderKind: "x2y2",
            },
          });
        }

        break;
      }
    }
  }

  return {
    cancelEvents,
    fillEvents,

    fillInfos,
    orderInfos,
    makerInfos,
  };
};
