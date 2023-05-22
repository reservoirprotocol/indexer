/* eslint-disable @typescript-eslint/no-explicit-any */
import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export class IndexerApprovalEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.nft_approval_events";

  protected async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    // eslint-disable-next-line
    console.log("payload.after", payload.after);

    await WebsocketEventRouter({
      eventInfo: {
        ...payload.after,
        trigger: "insert",
      },
      eventKind: WebsocketEventKind.ApprovalEvent,
    });
  }

  protected async handleUpdate(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        ...payload.after,
        trigger: "update",
      },
      eventKind: WebsocketEventKind.ApprovalEvent,
    });
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
