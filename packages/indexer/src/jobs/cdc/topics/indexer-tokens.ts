/* eslint-disable @typescript-eslint/no-explicit-any */
import { redis } from "@/common/redis";

import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
// import { refreshAsksTokenJob } from "@/jobs/elasticsearch/asks/refresh-asks-token-job";
import { logger } from "@/common/logger";
import { refreshActivitiesTokenJob } from "@/jobs/elasticsearch/activities/refresh-activities-token-job";
import _ from "lodash";

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

    try {
      // Update the elasticsearch activities token cache
      const changed = [];

      for (const key in payload.after) {
        const beforeValue = payload.before[key];
        const afterValue = payload.after[key];

        if (beforeValue !== afterValue) {
          changed.push(key);
        }
      }

      if (
        changed.some((value) =>
          [
            "name",
            "image",
            "metadata_disabled",
            "image_version",
            "rarity_rank",
            "rarity_score",
          ].includes(value)
        )
      ) {
        await redis.set(
          `token-cache:${payload.after.contract}:${payload.after.token_id}`,
          JSON.stringify({
            contract: payload.after.contract,
            token_id: payload.after.token_id,
            name: payload.after.name,
            image: payload.after.image,
            image_version: payload.after.image_version,
            metadata_disabled: payload.after.metadata_disabled,
            rarity_rank: payload.after.rarity_rank,
            rarity_score: payload.after.rarity_score,
          }),
          "EX",
          60 * 60 * 24,
          "XX"
        );
      }

      const spamStatusChanged = payload.before.is_spam !== payload.after.is_spam;

      // Update the elasticsearch activities index
      if (spamStatusChanged) {
        await refreshActivitiesTokenJob.addToQueue(payload.after.contract, payload.after.token_id);
      }

      // Update the elasticsearch asks index
      if (payload.after.floor_sell_id) {
        const flagStatusChanged = payload.before.is_flagged !== payload.after.is_flagged;
        const rarityRankChanged = payload.before.rarity_rank !== payload.after.rarity_rank;

        if (flagStatusChanged || rarityRankChanged || spamStatusChanged) {
          // await refreshAsksTokenJob.addToQueue(payload.after.contract, payload.after.token_id);
        }
      }

      const metadataInitializedAtChanged =
        payload.before.metadata_initialized_at !== payload.after.metadata_initialized_at;

      if (metadataInitializedAtChanged && _.random(100) <= 25) {
        logger.info(
          "token-metadata-latency-metric",
          JSON.stringify({
            topic: "metrics",
            contract: payload.after.contract,
            tokenId: payload.after.token_id,
            indexedLatency: Math.floor(
              (new Date(payload.after.metadata_indexed_at).getTime() -
                new Date(payload.after.created_at).getTime()) /
                1000
            ),
            initializedLatency: Math.floor(
              (new Date(payload.after.metadata_initialized_at).getTime() -
                new Date(payload.after.created_at).getTime()) /
                1000
            ),
            createdAt: payload.after.created_at,
            indexedAt: payload.after.metadata_indexed_at,
            initializedAt: payload.after.metadata_initialized_at,
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
