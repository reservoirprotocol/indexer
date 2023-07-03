import { config } from "@/config/index";
import { logger } from "@/common/logger";

import { Log } from "@ethersproject/abstract-provider";

import { concat } from "@/common/utils";
import { EventKind, EventSubKind } from "@/events-sync/data";
import { assignSourceToFillEvents } from "@/events-sync/handlers/utils/fills";
import { BaseEventParams } from "@/events-sync/parser";
import * as es from "@/events-sync/storage";

import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import * as mintsProcess from "@/jobs/mints/process";
import { AddressZero } from "@ethersproject/constants";
import { RecalcCollectionOwnerCountInfo } from "@/jobs/collection-updates/recalc-owner-count-queue";
import { recalcOwnerCountQueueJob } from "@/jobs/collection-updates/recalc-owner-count-queue-job";
import { mintQueueJob, MintQueueJobPayload } from "@/jobs/token-updates/mint-queue-job";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

import {
  processActivityEventJob,
  EventKind as ProcessActivityEventKind,
  ProcessActivityEventJobPayload,
} from "@/jobs/activities/process-activity-event-job";
import { fillUpdatesJob, FillUpdatesJobPayload } from "@/jobs/fill-updates/fill-updates-job";
import { fillPostProcessJob } from "@/jobs/fill-updates/fill-post-process-job";

// Semi-parsed and classified event
export type EnhancedEvent = {
  kind: EventKind;
  subKind: EventSubKind;
  baseEventParams: BaseEventParams;
  log: Log;
};

// Data extracted from purely on-chain information
export type OnChainData = {
  // Fills
  fillEvents: es.fills.Event[];
  fillEventsPartial: es.fills.Event[];
  fillEventsOnChain: es.fills.Event[];

  // Cancels
  cancelEvents: es.cancels.Event[];
  cancelEventsOnChain: es.cancels.Event[];
  bulkCancelEvents: es.bulkCancels.Event[];
  nonceCancelEvents: es.nonceCancels.Event[];

  // Approvals
  // Due to some complexities around them, ft approvals are handled
  // differently (eg. ft approvals can decrease implicitly when the
  // spender transfers from the owner's balance, without any events
  // getting emitted)
  nftApprovalEvents: es.nftApprovals.Event[];

  // Transfers
  ftTransferEvents: es.ftTransfers.Event[];
  nftTransferEvents: es.nftTransfers.Event[];

  // For keeping track of mints and last sales
  fillInfos: FillUpdatesJobPayload[];
  mintInfos: MintQueueJobPayload[];
  mints: mintsProcess.Mint[];

  // For properly keeping orders validated on the go
  orderInfos: orderUpdatesById.OrderInfo[];
  makerInfos: orderUpdatesByMaker.MakerInfo[];

  // Orders
  orders: orderbookOrders.GenericOrderInfo[];
};

export const initOnChainData = (): OnChainData => ({
  fillEvents: [],
  fillEventsOnChain: [],
  fillEventsPartial: [],

  cancelEvents: [],
  cancelEventsOnChain: [],
  bulkCancelEvents: [],
  nonceCancelEvents: [],

  nftApprovalEvents: [],

  ftTransferEvents: [],
  nftTransferEvents: [],

  fillInfos: [],
  mintInfos: [],
  mints: [],

  orderInfos: [],
  makerInfos: [],

  orders: [],
});

// Process on-chain data (save to db, trigger any further processes, ...)
export const processOnChainData = async (data: OnChainData, backfill?: boolean) => {
  // Post-process fill events

  const allFillEvents = concat(data.fillEvents, data.fillEventsPartial, data.fillEventsOnChain);
  const startAssignSourceToFillEvents = Date.now();
  if (!backfill) {
    await Promise.all([assignSourceToFillEvents(allFillEvents)]);
  }
  const endAssignSourceToFillEvents = Date.now();

  // Persist events
  // WARNING! Fills should always come first in order to properly mark
  // the fillability status of orders as 'filled' and not 'no-balance'
  const startPersistEvents = Date.now();
  await Promise.all([
    es.fills.addEvents(data.fillEvents),
    es.fills.addEventsPartial(data.fillEventsPartial),
    es.fills.addEventsOnChain(data.fillEventsOnChain),
  ]);
  const endPersistEvents = Date.now();

  // concat all fill events
  const allFillEventsForWebsocket = concat(
    data.fillEvents,
    data.fillEventsPartial,
    data.fillEventsOnChain
  );

  // Persist other events
  const startPersistOtherEvents = Date.now();
  await Promise.all([
    es.cancels.addEvents(data.cancelEvents),
    es.cancels.addEventsOnChain(data.cancelEventsOnChain),
    es.bulkCancels.addEvents(data.bulkCancelEvents),
    es.nonceCancels.addEvents(data.nonceCancelEvents),
    es.nftApprovals.addEvents(data.nftApprovalEvents),
    es.ftTransfers.addEvents(data.ftTransferEvents, Boolean(backfill)),
    es.nftTransfers.addEvents(data.nftTransferEvents, Boolean(backfill)),
  ]);

  const endPersistOtherEvents = Date.now();

  try {
    if (config.doOldOrderWebsocketWork) {
      await Promise.all([
        ...allFillEventsForWebsocket.map((event) =>
          WebsocketEventRouter({
            eventInfo: {
              tx_hash: event.baseEventParams.txHash,
              log_index: event.baseEventParams.logIndex,
              batch_index: event.baseEventParams.batchIndex,
              trigger: "insert",
              offset: "",
            },
            eventKind: WebsocketEventKind.SaleEvent,
          })
        ),
        ...data.nftApprovalEvents.map((event) =>
          WebsocketEventRouter({
            eventInfo: {
              address: event.baseEventParams.address,
              block: event.baseEventParams.block.toString(),
              block_hash: event.baseEventParams.blockHash,
              timestamp: event.baseEventParams.timestamp.toString(),
              owner: event.owner,
              operator: event.operator,
              approved: event.approved.toString(),
              tx_hash: event.baseEventParams.txHash,
              tx_index: event.baseEventParams.txIndex.toString(),
              log_index: event.baseEventParams.logIndex.toString(),
              batch_index: event.baseEventParams.batchIndex.toString(),
              offset: "",
              trigger: "insert",
            },
            eventKind: WebsocketEventKind.ApprovalEvent,
          })
        ),

        ...data.nftTransferEvents.map((event) =>
          WebsocketEventRouter({
            eventInfo: {
              address: event.baseEventParams.address,
              block: event.baseEventParams.block.toString(),
              block_hash: event.baseEventParams.blockHash,
              timestamp: event.baseEventParams.timestamp.toString(),
              tx_hash: event.baseEventParams.txHash,
              tx_index: event.baseEventParams.txIndex.toString(),
              log_index: event.baseEventParams.logIndex.toString(),
              batch_index: event.baseEventParams.batchIndex.toString(),
              to: event.to,
              from: event.from,
              amount: event.amount.toString(),
              token_id: event.tokenId.toString(),
              created_at: new Date(event.baseEventParams.timestamp).toISOString(),
              offset: "",
              trigger: "insert",
            },
            eventKind: WebsocketEventKind.TransferEvent,
          })
        ),
      ]);
    }
  } catch (error) {
    logger.error(
      "processOnChainData",
      `Error processing websocket event. error=${JSON.stringify(error)}`
    );
  }

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
      orderUpdatesById.addToQueue(data.orderInfos),
      orderUpdatesByMaker.addToQueue(data.makerInfos),
      orderbookOrders.addToQueue(data.orders),
    ]);
  }

  // Mints and last sales
  await mintQueueJob.addToQueue(data.mintInfos);
  await fillUpdatesJob.addToQueue(data.fillInfos);
  if (!backfill) {
    await mintsProcess.addToQueue(data.mints);
  }

  const startFillPostProcess = Date.now();
  if (allFillEvents.length) {
    await fillPostProcessJob.addToQueue([allFillEvents]);
  }
  const endFillPostProcess = Date.now();

  // TODO: Is this the best place to handle activities?

  const recalcCollectionOwnerCountInfo: RecalcCollectionOwnerCountInfo[] =
    data.nftTransferEvents.map((event) => ({
      context: "event-sync",
      kind: "contactAndTokenId",
      data: {
        contract: event.baseEventParams.address,
        tokenId: event.tokenId,
      },
    }));

  if (recalcCollectionOwnerCountInfo.length) {
    await recalcOwnerCountQueueJob.addToQueue(recalcCollectionOwnerCountInfo);
  }

  // Process fill activities
  const fillActivityInfos: ProcessActivityEventJobPayload[] = allFillEvents.map((event) => {
    return {
      kind: ProcessActivityEventKind.fillEvent,
      data: {
        transactionHash: event.baseEventParams.txHash,
        logIndex: event.baseEventParams.logIndex,
        batchIndex: event.baseEventParams.batchIndex,
      },
    };
  });

  const startProcessActivityEvent = Date.now();
  await processActivityEventJob.addToQueue(fillActivityInfos);
  const endProcessActivityEvent = Date.now();

  const filteredNftTransferEvents = data.nftTransferEvents.filter((event) => {
    if (event.from !== AddressZero) {
      return true;
    }

    return !fillActivityInfos.some((fillActivityInfo) => {
      const fillActivityInfoData = fillActivityInfo.data;

      return (
        fillActivityInfoData.transactionHash === event.baseEventParams.txHash &&
        fillActivityInfoData.logIndex === event.baseEventParams.logIndex &&
        fillActivityInfoData.batchIndex === event.baseEventParams.batchIndex
      );
    });
  });

  // Process transfer activities
  const transferActivityInfos: ProcessActivityEventJobPayload[] = filteredNftTransferEvents.map(
    (event) => ({
      kind: ProcessActivityEventKind.nftTransferEvent,
      data: {
        transactionHash: event.baseEventParams.txHash,
        logIndex: event.baseEventParams.logIndex,
        batchIndex: event.baseEventParams.batchIndex,
      },
    })
  );

  const startProcessTransferActivityEvent = Date.now();
  await processActivityEventJob.addToQueue(transferActivityInfos);
  const endProcessTransferActivityEvent = Date.now();

  return {
    // return the time it took to process each step
    assignSourceToFillEvents: endAssignSourceToFillEvents - startAssignSourceToFillEvents,
    persistEvents: endPersistEvents - startPersistEvents,
    persistOtherEvents: endPersistOtherEvents - startPersistOtherEvents,
    fillPostProcess: endFillPostProcess - startFillPostProcess,
    processActivityEvent: endProcessActivityEvent - startProcessActivityEvent,
    processTransferActivityEvent:
      endProcessTransferActivityEvent - startProcessTransferActivityEvent,

    // return the number of events processed
    fillEvents: data.fillEvents.length,
    fillEventsPartial: data.fillEventsPartial.length,
    fillEventsOnChain: data.fillEventsOnChain.length,
    cancelEvents: data.cancelEvents.length,
    cancelEventsOnChain: data.cancelEventsOnChain.length,
    bulkCancelEvents: data.bulkCancelEvents.length,
    nonceCancelEvents: data.nonceCancelEvents.length,
    nftApprovalEvents: data.nftApprovalEvents.length,
    ftTransferEvents: data.ftTransferEvents.length,
    nftTransferEvents: data.nftTransferEvents.length,
    fillInfos: data.fillInfos.length,
    orderInfos: data.orderInfos.length,
    makerInfos: data.makerInfos.length,
    orders: data.orders.length,
    mints: data.mints.length,
    mintInfos: data.mintInfos.length,
  };
};
