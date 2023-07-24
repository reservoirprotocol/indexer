/* eslint-disable @typescript-eslint/no-explicit-any */
import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export class IndexerFillEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.fill_events_2";

  protected async handleInsert(payload: any, offset: string): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        tx_hash: payload.after.tx_hash,
        log_index: payload.after.log_index,
        batch_index: payload.after.batch_index,
        trigger: "insert",
        offset,
      },
      eventKind: WebsocketEventKind.SaleEvent,
    });
  }

  protected async handleUpdate(payload: any, offset: string): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        tx_hash: payload.after.tx_hash,
        log_index: payload.after.log_index,
        batch_index: payload.after.batch_index,
        trigger: "update",
        offset,
      },
      eventKind: WebsocketEventKind.SaleEvent,
    });
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
