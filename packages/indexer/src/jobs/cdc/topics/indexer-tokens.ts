/* eslint-disable @typescript-eslint/no-explicit-any */
import { redis } from "@/common/redis";

import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import { refreshAsksTokenFlagStatusJob } from "@/jobs/asks/refresh-asks-token-flag-status-job";
import { logger } from "@/common/logger";

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
          metadata_disabled: payload.after.metadata_disabled,
        }),
        "EX",
        60 * 60 * 24,
        "XX"
      );
    }

    try {
      const flagStatusChanged = payload.before.is_flagged !== payload.after.is_flagged;

      if (flagStatusChanged) {
        await refreshAsksTokenFlagStatusJob.addToQueue(
          payload.after.contract,
          payload.after.token_id
        );
      }
    } catch (error) {
      logger.error(
        "kafka-event-handler",
        JSON.stringify({
          topic: "debugAskIndex",
          message: `Handle token error. error=${error}`,
          payload,
          error,
        })
      );
    }
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
