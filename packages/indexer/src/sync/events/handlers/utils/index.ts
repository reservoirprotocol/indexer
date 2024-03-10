import { Log } from "@ethersproject/abstract-provider";
import { AddressZero } from "@ethersproject/constants";
import _ from "lodash";

import { concat } from "@/common/utils";
import { EventKind, EventSubKind } from "@/events-sync/data";
import {
  assignMintCommentToFillEvents,
  assignSourceToFillEvents,
} from "@/events-sync/handlers/utils/fills";
import { BaseEventParams } from "@/events-sync/parser";
import * as es from "@/events-sync/storage";
import * as pendingTxs from "@/utils/pending-txs";

import { GenericOrderInfo } from "@/jobs/orderbook/utils";
import {
  recalcOwnerCountQueueJob,
  RecalcOwnerCountQueueJobPayload,
} from "@/jobs/collection-updates/recalc-owner-count-queue-job";
import { mintQueueJob, MintQueueJobPayload } from "@/jobs/token-updates/mint-queue-job";
import {
  processActivityEventJob,
  EventKind as ProcessActivityEventKind,
  ProcessActivityEventJobPayload,
} from "@/jobs/elasticsearch/activities/process-activity-event-job";
import { fillUpdatesJob, FillUpdatesJobPayload } from "@/jobs/fill-updates/fill-updates-job";
import { fillPostProcessJob } from "@/jobs/fill-updates/fill-post-process-job";
import { mintsProcessJob, MintsProcessJobPayload } from "@/jobs/mints/mints-process-job";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";
import {
  orderUpdatesByMakerJob,
  OrderUpdatesByMakerJobPayload,
} from "@/jobs/order-updates/order-updates-by-maker-job";
import { orderbookOrdersJob } from "@/jobs/orderbook/orderbook-orders-job";
import { transferUpdatesJob } from "@/jobs/transfer-updates/transfer-updates-job";
import {
  permitUpdatesJob,
  PermitUpdatesJobPayload,
} from "@/jobs/permit-updates/permit-updates-job";

// Semi-parsed and classified event
export type EnhancedEvent = {
  kind: EventKind;
  subKind: EventSubKind;
  baseEventParams: BaseEventParams;
  log: Log;
};

export type MintComment = {
  token: string;
  tokenId?: string;
  quantity: number;
  comment: string;
  baseEventParams: BaseEventParams;
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
  mints: MintsProcessJobPayload[];
  mintComments: MintComment[];

  // For properly keeping orders validated on the go
  orderInfos: OrderUpdatesByIdJobPayload[];
  makerInfos: OrderUpdatesByMakerJobPayload[];

  // For properly keeping permits validated on the go
  permitInfos: PermitUpdatesJobPayload[];

  // Orders
  orders: GenericOrderInfo[];
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
  mintComments: [],

  orderInfos: [],
  makerInfos: [],

  permitInfos: [],

  orders: [],
});

// Process on-chain data (save to db, trigger any further processes, ...)
export const processOnChainData = async (data: OnChainData, backfill?: boolean) => {
  // Post-process fill events

  const allFillEvents = concat(data.fillEvents, data.fillEventsPartial, data.fillEventsOnChain);
  const nonFillTransferEvents = _.filter(data.nftTransferEvents, (transfer) => {
    return (
      transfer.from !== AddressZero &&
      !_.some(
        allFillEvents,
        (fillEvent) =>
          fillEvent.baseEventParams.txHash === transfer.baseEventParams.txHash &&
          fillEvent.baseEventParams.logIndex === transfer.baseEventParams.logIndex &&
          fillEvent.baseEventParams.batchIndex === transfer.baseEventParams.batchIndex
      )
    );
  });

  const startAssignMintCommentToFillEvents = Date.now();
  if (!backfill) {
    await Promise.all([assignMintCommentToFillEvents(allFillEvents, data.mintComments)]);
  }
  const endAssignMintCommentToFillEvents = Date.now();

  const startAssignSourceToFillEvents = Date.now();
  if (!backfill) {
    await Promise.all([
      assignSourceToFillEvents(allFillEvents),
      pendingTxs.onFillEventsCallback(allFillEvents),
    ]);
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

  const startAddingToQueues = Date.now();
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
      orderUpdatesByIdJob.addToQueue(data.orderInfos),
      orderUpdatesByMakerJob.addToQueue(data.makerInfos),
      permitUpdatesJob.addToQueue(data.permitInfos),
      orderbookOrdersJob.addToQueue(data.orders),
    ]);
  }
  const endAddingToQueues = Date.now();

  // Mints and last sales
  const startAddingToQueuesMintAndLastSales = Date.now();
  await transferUpdatesJob.addToQueue(nonFillTransferEvents);
  await mintQueueJob.addToQueue(data.mintInfos);
  await fillUpdatesJob.addToQueue(data.fillInfos);
  const endAddingToQueuesMintAndLastSales = Date.now();

  const startMintProcess = Date.now();
  if (!backfill) {
    await mintsProcessJob.addToQueue(data.mints);
  }
  const endMintProcess = Date.now();

  const startFillPostProcess = Date.now();
  if (allFillEvents.length) {
    await fillPostProcessJob.addToQueue([allFillEvents]);
  }
  const endFillPostProcess = Date.now();

  // TODO: Is this the best place to handle activities?

  const recalcCollectionOwnerCountInfo: RecalcOwnerCountQueueJobPayload[] =
    data.nftTransferEvents.map((event) => ({
      context: "event-sync",
      kind: "contactAndTokenId",
      data: {
        contract: event.baseEventParams.address,
        tokenId: event.tokenId,
      },
    }));

  const startProcessRecalcOwnerCount = Date.now();
  if (recalcCollectionOwnerCountInfo.length) {
    await recalcOwnerCountQueueJob.addToQueue(recalcCollectionOwnerCountInfo);
  }
  const endProcessRecalcOwnerCount = Date.now();

  // Process fill activities
  const fillActivityInfos: ProcessActivityEventJobPayload[] = allFillEvents.map((event) => {
    return {
      kind: ProcessActivityEventKind.fillEvent,
      data: {
        txHash: event.baseEventParams.txHash,
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
        fillActivityInfoData.txHash === event.baseEventParams.txHash &&
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
        txHash: event.baseEventParams.txHash,
        logIndex: event.baseEventParams.logIndex,
        batchIndex: event.baseEventParams.batchIndex,
      },
    })
  );

  const startProcessTransferActivityEvent = Date.now();
  await processActivityEventJob.addToQueue(transferActivityInfos);
  const endProcessTransferActivityEvent = Date.now();

  return {
    addingToQueues: endAddingToQueues - startAddingToQueues,
    addingToQueuesMintAndLastSales:
      endAddingToQueuesMintAndLastSales - startAddingToQueuesMintAndLastSales,
    mintProcess: endMintProcess - startMintProcess,
    // Return the time it took to process each step
    processRecalcOwnerCount: endProcessRecalcOwnerCount - startProcessRecalcOwnerCount,
    assignMintCommentToFillEvents:
      endAssignMintCommentToFillEvents - startAssignMintCommentToFillEvents,
    assignSourceToFillEvents: endAssignSourceToFillEvents - startAssignSourceToFillEvents,
    persistEvents: endPersistEvents - startPersistEvents,
    persistOtherEvents: endPersistOtherEvents - startPersistOtherEvents,
    fillPostProcess: endFillPostProcess - startFillPostProcess,
    processActivityEvent: endProcessActivityEvent - startProcessActivityEvent,
    processTransferActivityEvent:
      endProcessTransferActivityEvent - startProcessTransferActivityEvent,

    // Return the number of events processed
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
    mintComments: data.mintComments.length,
    mintInfos: data.mintInfos.length,
  };
};
