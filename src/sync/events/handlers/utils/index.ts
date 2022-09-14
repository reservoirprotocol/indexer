import { Log } from "@ethersproject/abstract-provider";

import { concat } from "@/common/utils";
import { EventDataKind } from "@/events-sync/data";
import { assignSourceToFillEvents, assignWashTradingScoreToFillEvents } from "@/events-sync/index";
import { BaseEventParams } from "@/events-sync/parser";

import * as es from "@/events-sync/storage";

import * as processActivityEvent from "@/jobs/activities/process-activity-event";
import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import * as tokenUpdatesMint from "@/jobs/token-updates/mint-queue";

// Semi-parsed and classified event
export type EnhancedEvent = {
  kind: EventDataKind;
  baseEventParams: BaseEventParams;
  log: Log;
};

// Data extracted from purely on-chain information
export type OnChainData = {
  fillEvents?: es.fills.Event[];
  fillEventsOnChain?: es.fills.Event[];
  cancelEvents?: es.cancels.Event[];
  cancelEventsOnChain?: es.cancels.Event[];
  nftTransferEvents?: es.nftTransfers.Event[];

  fillInfos?: fillUpdates.FillInfo[];
  orderInfos?: orderUpdatesById.OrderInfo[];
  mintInfos?: tokenUpdatesMint.MintInfo[];

  orders?: orderbookOrders.GenericOrderInfo[];
};

// Process on-chain data (save to db, trigger any further processes, ...)
export const processOnChainData = async (data: OnChainData, backfill?: boolean) => {
  // Post-process fill events
  const allFillEvents = concat(data.fillEvents, data.fillEventsOnChain);
  if (!backfill) {
    await Promise.all([
      assignSourceToFillEvents(allFillEvents),
      assignWashTradingScoreToFillEvents(allFillEvents),
    ]);
  }

  // Persist events
  // WARNING! Fills should always come first in order to properly mark
  // the fillability status of orders as 'filled' and not 'no-balance'
  await Promise.all([
    es.fills.addEvents(data.fillEvents ?? []),
    es.fills.addEventsOnChain(data.fillEventsOnChain ?? []),
  ]);
  await Promise.all([
    es.cancels.addEvents(data.cancelEvents ?? []),
    es.cancels.addEventsOnChain(data.cancelEventsOnChain ?? []),
    es.nftTransfers.addEvents(data.nftTransferEvents ?? [], Boolean(backfill)),
  ]);

  // Trigger further processes:
  // - revalidate potentially-affected orders
  // - store on-chain orders
  if (!backfill) {
    // WARNING! It's very important to guarantee that the previous
    // events are persisted to the database before any of the jobs
    // below are executed. Otherwise, the jobs can potentially use
    // stale data which will cause inconsistencies (eg. orders can
    // have wrong statuses)
    await Promise.all([
      orderUpdatesById.addToQueue(data.orderInfos ?? []),
      orderbookOrders.addToQueue(data.orders ?? []),
    ]);
  }

  await fillUpdates.addToQueue(data.fillInfos ?? []);

  // Process fill activities
  const fillActivityInfos: processActivityEvent.EventInfo[] = allFillEvents.map((event) => {
    let fromAddress = event.maker;
    let toAddress = event.taker;

    if (event.orderSide === "buy") {
      fromAddress = event.taker;
      toAddress = event.maker;
    }

    return {
      kind: processActivityEvent.EventKind.fillEvent,
      data: {
        contract: event.contract,
        tokenId: event.tokenId,
        fromAddress,
        toAddress,
        price: Number(event.price),
        amount: Number(event.amount),
        transactionHash: event.baseEventParams.txHash,
        logIndex: event.baseEventParams.logIndex,
        batchIndex: event.baseEventParams.batchIndex,
        blockHash: event.baseEventParams.blockHash,
        timestamp: event.baseEventParams.timestamp,
        orderId: event.orderId || "",
        orderSourceIdInt: Number(event.orderSourceId),
      },
    };
  });
  await processActivityEvent.addToQueue(fillActivityInfos);

  // Process transfer activities
  const transferActivityInfos: processActivityEvent.EventInfo[] = (
    data.nftTransferEvents ?? []
  ).map((event) => ({
    context: [
      processActivityEvent.EventKind.nftTransferEvent,
      event.baseEventParams.txHash,
      event.baseEventParams.logIndex,
      event.baseEventParams.batchIndex,
    ].join(":"),
    kind: processActivityEvent.EventKind.nftTransferEvent,
    data: {
      contract: event.baseEventParams.address,
      tokenId: event.tokenId,
      fromAddress: event.from,
      toAddress: event.to,
      amount: Number(event.amount),
      transactionHash: event.baseEventParams.txHash,
      logIndex: event.baseEventParams.logIndex,
      batchIndex: event.baseEventParams.batchIndex,
      blockHash: event.baseEventParams.blockHash,
      timestamp: event.baseEventParams.timestamp,
    },
  }));
  await processActivityEvent.addToQueue(transferActivityInfos);

  // Process mints
  await tokenUpdatesMint.addToQueue(data.mintInfos ?? []);
};
