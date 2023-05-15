/* eslint-disable @typescript-eslint/no-explicit-any */
import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export class IndexerOrderEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.order_events";

  protected async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        kind: payload.after.kind,
        orderId: payload.after.order_id,
      },
      eventKind: WebsocketEventKind.SellOrder,
    });

    // all other cases, trigger ask.updated event
  }

  protected async handleUpdate(payload: any): Promise<void> {
    await WebsocketEventRouter({
      eventInfo: {
        kind: payload.after.kind,
        orderId: payload.after.order_id,
      },
      eventKind: WebsocketEventKind.SellOrder,
    });
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
