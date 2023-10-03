/* eslint-disable @typescript-eslint/no-explicit-any */
import { redis } from "@/common/redis";

import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export class IndexerTokensHandler extends KafkaEventHandler {
  topicName = "indexer.public.tokens";

  protected async handleInsert(payload: any, offset: string): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        before: payload.before,
        after: payload.after,
        trigger: "insert",
        offset: offset,
      },
      eventKind: WebsocketEventKind.TokenEvent,
    });
  }

  protected async handleUpdate(payload: any, offset: string): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        before: payload.before,
        after: payload.after,
        trigger: "update",
        offset: offset,
      },
      eventKind: WebsocketEventKind.TokenEvent,
    });

    if (payload.after.name || payload.after.image) {
      await redis.set(
        `token-cache:${payload.after.contract}:${payload.after.token_id}`,
        JSON.stringify({
          contract: payload.after.contract,
          token_id: payload.after.token_id,
          name: payload.after.name,
          image: payload.after.image,
        }),
        "EX",
        60 * 60 * 24,
        "XX"
      );
    }
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
