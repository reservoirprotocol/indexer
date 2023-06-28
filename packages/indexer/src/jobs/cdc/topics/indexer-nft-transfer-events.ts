/* eslint-disable @typescript-eslint/no-explicit-any */

import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export class IndexerTransferEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.nft_transfer_events";

  protected async handleInsert(payload: any, offset: string): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        ...payload.after,
        trigger: "insert",
        offset,
      },
      eventKind: WebsocketEventKind.TransferEvent,
    });
  }

  protected async handleUpdate(payload: any, offset: string): Promise<void> {
    if (!payload.after) {
      return;
    }
    return;

    await WebsocketEventRouter({
      eventInfo: {
        ...payload.after,
        trigger: "update",
        offset,
      },
      eventKind: WebsocketEventKind.TransferEvent,
    });
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
