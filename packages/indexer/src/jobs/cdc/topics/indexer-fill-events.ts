/* eslint-disable @typescript-eslint/no-explicit-any */
import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export class IndexerFillEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.fill_events_2";

  protected async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        kind: payload.after.kind,
        orderId: payload.after.order_id,
      },
      eventKind: WebsocketEventKind.SaleEvent,
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
      eventKind: WebsocketEventKind.SaleEvent,
    });
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
