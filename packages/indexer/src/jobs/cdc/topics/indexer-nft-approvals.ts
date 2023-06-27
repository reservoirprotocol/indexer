/* eslint-disable @typescript-eslint/no-explicit-any */
import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export class IndexerApprovalEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.nft_approval_events";

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
      eventKind: WebsocketEventKind.ApprovalEvent,
    });
  }

  protected async handleUpdate(payload: any, offset: string): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        ...payload.after,
        trigger: "update",
        offset,
      },
      eventKind: WebsocketEventKind.ApprovalEvent,
    });
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
