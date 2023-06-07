/* eslint-disable @typescript-eslint/no-explicit-any */
import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export class IndexerTokensHandler extends KafkaEventHandler {
  topicName = "indexer.public.tokens";

  protected async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        before: payload.before,
        after: payload.after,
        trigger: "insert",
      },
      eventKind: WebsocketEventKind.TokenEvent,
    });
  }

  protected async handleUpdate(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        before: payload.before,
        after: payload.after,
        trigger: "update",
      },
      eventKind: WebsocketEventKind.TokenEvent,
    });
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
