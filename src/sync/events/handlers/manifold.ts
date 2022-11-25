import { Log } from "@ethersproject/abstract-provider";

import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";

import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import { OrderInfo } from "@/orderbook/orders/manifold";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const cancelEvents: es.cancels.Event[] = [];
  const fillEventsPartial: es.fills.Event[] = [];

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
        const orderId = args["listingId"];

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
        // event ModifyListing(uint40 indexed listingId, uint256 initialAmount, uint48 startTime, uint48 endTime);
        const { args } = eventData.abi.parseLog(log);
        const listingId = args["listingId"].toLowerCase();
        const initialAmount = args["initialAmount"].toLowerCase();
        const startTime = args["startTime"].toLowerCase();
        const endTime = args["endTime"].toLowerCase();

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
    orders: orders.map((info) => ({
      kind: "manifold",
      info,
    })),
  };
};
