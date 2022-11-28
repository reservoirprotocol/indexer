import { Log } from "@ethersproject/abstract-provider";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

import { getEventData } from "@/events-sync/data";
import { bn } from "@/common/utils";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";

import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import { getOrderId, OrderInfo } from "@/orderbook/orders/manifold";
import { manifold } from "@/orderbook/orders";
import { getUSDAndNativePrices } from "@/utils/prices";
import { CallTrace } from "@georgeroman/evm-tx-simulator/dist/types";
import { BigNumber } from "ethers";
import { BaseEventParams } from "../parser";

type TransferEventWithContract = es.nftTransfers.Event & { tokenContract: string };

const findEthCalls = (calls: CallTrace[], eventParams: BaseEventParams) => {
  if (!calls || !calls.length) {
    return [];
  }

  const ethCalls: CallTrace[] = [];
  calls.forEach((call: CallTrace) => {
    if (call.type === "CALL" && call.from === eventParams.address && call.value !== "0x0") {
      ethCalls.push(call);
    }

    if (call.calls && call.calls.length) {
      ethCalls.push(...findEthCalls(call.calls, eventParams));
    }
  });

  return ethCalls;
};

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const cancelEventsOnChain: es.cancels.Event[] = [];
  const fillEventsOnChain: es.fills.Event[] = [];
  const nftTransferEvents: TransferEventWithContract[] = [];

  const fillInfos: fillUpdates.FillInfo[] = [];
  const orderInfos: orderUpdatesById.OrderInfo[] = [];
  const makerInfos: orderUpdatesByMaker.MakerInfo[] = [];

  // Keep track of any on-chain orders
  const orders: OrderInfo[] = [];

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
      case "manifold-cancel": {
        const { args } = eventData.abi.parseLog(log);
        const listingId = args["listingId"];
        const orderId = getOrderId(listingId);

        cancelEventsOnChain.push({
          orderKind: "manifold",
          orderId,
          baseEventParams,
        });

        orderInfos.push({
          context: `cancelled-${orderId}-${baseEventParams.txHash}-${Math.random()}`,
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

      case "manifold-purchase": {
        const parsedLog = eventData.abi.parseLog(log);
        const listingId = parsedLog.args["listingId"].toString();
        const amount = parsedLog.args["count"];

        let tokenId = "";
        let tokenContract = "";
        let maker = "";
        let taker = parsedLog.args["buyer"].toLowerCase();
        let currencyPrice = "";
        let currency = Sdk.Common.Addresses.Eth[config.chainId];

        const orderId = manifold.getOrderId(listingId);

        for (const log of currentTxLogs.slice(0, -1).reverse()) {
          // Skip once we detect another fill in the same transaction
          // (this will happen if filling through an aggregator)
          if (log.topics[0] === getEventData([eventData.kind])[0].topic) {
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
            const to = parsed.args["to"].toLowerCase();
            const amount = parsed.args["amount"].toString();
            // Maker is the receiver of tokens
            maker = to;
            currency = log.address.toLowerCase();
            currencyPrice = amount;
            break;
          } else {
            // Event data doesn't include full order information so we have to parse the calldata
            const txTrace = await utils.fetchTransactionTrace(baseEventParams.txHash);
            if (!txTrace) {
              // Skip any failed attempts to get the trace
              break;
            }

            // Maker is the function caller
            maker = txTrace.calls.from;
            // Search for eth transfer internal calls. After summing them we get the auction price.
            const ethCalls = findEthCalls(txTrace.calls.calls!, baseEventParams);
            currencyPrice = ethCalls
              .reduce((acc: BigNumber, c: CallTrace) => bn(c.value!).add(acc), bn(0))
              .toString();
          }
        }

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

            tokenId = event.tokenId;
            tokenContract = event.tokenContract.toLowerCase();
          }
        }

        if (!associatedNftTransferEvent) {
          // Skip if we can't associate to an NFT transfer event
          break;
        }

        // Handle: attribution
        const orderKind = "manifold";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
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
          contract: tokenContract,
          tokenId,
          amount,
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
          contract: tokenContract,
          tokenId,
          amount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }

      case "manifold-modify": {
        const { args } = eventData.abi.parseLog(log);
        const listingId = args["listingId"];
        const initialAmount = args["initialAmount"].toString();
        const startTime = args["startTime"];
        const endTime = args["endTime"];

        // Manifold doesn't provide full order info. `any` helps us overcome the type differences.
        // If we don' want to use `any` we'd have to specify some default values for the whole struct
        orders.push({
          orderParams: {
            id: listingId,
            details: {
              startTime,
              endTime,
              initialAmount,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          metadata: {},
        });

        break;
      }

      case "manifold-finalize": {
        const { args } = eventData.abi.parseLog(log);
        const listingId = args["listingId"];
        const orderId = getOrderId(listingId);

        // Like Wyvern, Manifold has two main issues:
        // - the traded token is not included in the fill event, so we have
        // to deduce it by checking the nft transfer occured exactly before
        // the fill event
        // - the payment token is not included in the fill event, and we deduce
        // it as well by checking any ERC20 transfers that occured close before
        // the fill event (and default to the native token if cannot find any)
        // - If no ERC20 transfer are found it means the order in an ETH auction,
        // so we have to deduce the price by checking the internal calls of the transaction

        let tokenContract = "";
        let tokenId = "";
        let maker = "";
        let taker = "";
        let currencyPrice = "0";
        let currency = Sdk.Common.Addresses.Eth[config.chainId];

        // Detect the payment token
        for (const log of currentTxLogs.slice(0, -1).reverse()) {
          // Skip once we detect another fill in the same transaction
          // (this will happen if filling through an aggregator)
          if (log.topics[0] === getEventData([eventData.kind])[0].topic) {
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
            const to = parsed.args["to"].toLowerCase();
            const amount = parsed.args["amount"].toString();
            // Maker is the receiver of tokens
            maker = to;
            currency = log.address.toLowerCase();
            currencyPrice = amount;
            break;

            // If we don't detect an ERC20 transfer as part of the same transaction
            // then we assume it's ETH
          } else {
            // Event data doesn't include full transaction information so we have to parse the calldata
            const txTrace = await utils.fetchTransactionTrace(baseEventParams.txHash);
            if (!txTrace) {
              // Skip any failed attempts to get the trace
              break;
            }

            // Maker is the function caller
            maker = txTrace.calls.from;
            // Search for eth transfer internal calls. After summing them we get the auction price.
            const ethCalls = findEthCalls(txTrace.calls.calls!, baseEventParams);
            currencyPrice = ethCalls
              .reduce((acc: BigNumber, c: CallTrace) => bn(c.value!).add(acc), bn(0))
              .toString();
          }
        }

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
            tokenId = event.tokenId;
            tokenContract = event.tokenContract.toLowerCase();
            // Taker is the receiver of the NFT
            taker = event.to;
          }
        }

        if (!associatedNftTransferEvent) {
          // Skip if we can't associate to an NFT transfer event
          break;
        }

        // Handle: attribution
        const orderKind = "manifold";
        const data = await utils.extractAttributionData(baseEventParams.txHash, orderKind);
        if (data.taker) {
          taker = data.taker;
        }

        // Handle: prices

        const prices = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!prices.nativePrice) {
          // We must always have the native price
          break;
        }

        fillEventsOnChain.push({
          orderKind,
          orderId,
          currency,
          orderSide: "buy",
          maker,
          taker,
          price: prices.nativePrice,
          currencyPrice,
          usdPrice: prices.usdPrice,
          contract: tokenContract,
          tokenId,
          amount: "1",
          orderSourceId: data.orderSource?.id,
          aggregatorSourceId: data.aggregatorSource?.id,
          fillSourceId: data.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: `manifold-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide: "sell",
          contract: tokenContract,
          tokenId,
          amount: "1",
          price: prices.nativePrice,
          timestamp: baseEventParams.timestamp,
        });
        break;
      }

      case "erc721-transfer": {
        const parsedLog = eventData.abi.parseLog(log);
        const from = parsedLog.args["from"].toLowerCase();
        const to = parsedLog.args["to"].toLowerCase();
        const tokenId = parsedLog.args["tokenId"].toString();
        const tokenContract = log.address;

        nftTransferEvents.push({
          kind: "erc721",
          from,
          to,
          tokenId,
          tokenContract,
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
        const tokenContract = log.address;

        nftTransferEvents.push({
          kind: "erc1155",
          tokenContract,
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

  return {
    cancelEventsOnChain,
    fillEventsOnChain,

    fillInfos,
    orderInfos,
    makerInfos,
    orders: orders.map((info) => ({
      kind: "manifold",
      info,
    })),
  };
};
