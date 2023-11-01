/* eslint-disable @typescript-eslint/no-explicit-any */
import { redis } from "@/common/redis";

import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import { refreshAsksTokenJob } from "@/jobs/asks/refresh-asks-token-job";
import { logger } from "@/common/logger";
import { config } from "@/config/index";

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

    try {
      if (payload.after.floor_sell_id) {
        const flagStatusChanged = payload.before.is_flagged !== payload.after.is_flagged;
        const rarityRankChanged = payload.before.rarity_rank !== payload.after.rarity_rank;

        if (flagStatusChanged || rarityRankChanged) {
          await refreshAsksTokenJob.addToQueue(payload.after.contract, payload.after.token_id);
        }
      }

      const metadataInitializedAtChanged =
        payload.before.metadata_initialized_at !== payload.after.metadata_initialized_at;

      if (metadataInitializedAtChanged && config.chainId === 1) {
        logger.info(
          "token-metadata-initialized-metric",
          JSON.stringify({
            topic: "metrics",
            contract: payload.after.contract,
            tokenId: payload.after.token_id,
            latencyFromCreatedAt: Math.floor(
              (new Date(payload.after.metadata_initialized_at).getTime() -
                new Date(payload.after.created_at).getTime()) /
                1000
            ),
            latencyFromIndexedAt: Math.floor(
              (new Date(payload.after.metadata_initialized_at).getTime() -
                new Date(payload.after.metadata_indexed_at).getTime()) /
                1000
            ),
          })
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
