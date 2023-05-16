/* eslint-disable @typescript-eslint/no-explicit-any */

import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export class IndexerBalanceEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.nft_balances";

  protected async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        ...payload.after,
        trigger: "insert",
      },
      eventKind: WebsocketEventKind.BalanceEvent,
    });
  }

  protected async handleUpdate(payload: any): Promise<void> {
    // probably do nothing here
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        ...payload.after,
        trigger: "update",
      },
      eventKind: WebsocketEventKind.BalanceEvent,
    });
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
