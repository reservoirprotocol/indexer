/* eslint-disable @typescript-eslint/no-explicit-any */
import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export class IndexerBidEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.bid_events";

  protected async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }
    await WebsocketEventRouter({
      eventInfo: {
        kind: payload.after.kind,
        orderId: payload.after.order_id,
        trigger: payload.after.kind === "new-order" ? "insert" : "update",
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
        trigger: payload.after.kind === "new-order" ? "insert" : "update",
      },
      eventKind: WebsocketEventKind.BuyOrder,
    });
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
