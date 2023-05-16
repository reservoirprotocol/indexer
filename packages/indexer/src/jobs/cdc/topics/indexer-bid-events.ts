/* eslint-disable @typescript-eslint/no-explicit-any */
import { KafkaCdcEventHandler } from "@/jobs/cdc/topics/kafka-cdc-event-handler-abstract";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export class IndexerBidEventsHandler extends KafkaCdcEventHandler {
  topicName = "indexer.public.bid_events";

  protected async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }
    await WebsocketEventRouter({
      eventInfo: {
        kind: payload.after.kind,
        orderId: payload.after.order_id,
      },
      eventKind: WebsocketEventKind.BuyOrder,
    });
  }

  protected async handleUpdate(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        kind: payload.after.kind,
        orderId: payload.after.order_id,
      },
      eventKind: WebsocketEventKind.BuyOrder,
    });
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
