import { Log } from "@ethersproject/abstract-provider";

import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";

import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const cancelEvents: es.cancels.Event[] = [];
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
      case "manifold-cancel": {
        const { args } = eventData.abi.parseLog(log);
        const orderId = args["id"].toLowerCase();

        cancelEvents.push({
          orderKind: "manifold",
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

      case "manifold-purchase": {
        //TODO: Add manifold logic
        break;
      }

      case "manifold-bid": {
        //TODO: Add manifold logic
        break;
      }

      case "manifold-modify": {
        //TODO: Add manifold logic
        break;
      }

      case "manifold-finalize": {
        //TODO: Add manifold logic
        break;
      }
    }
  }

  return {
    cancelEvents,
    fillEventsPartial,

    fillInfos,
    orderInfos,
    makerInfos,
  };
};
