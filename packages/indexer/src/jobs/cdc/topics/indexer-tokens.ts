/* eslint-disable @typescript-eslint/no-explicit-any */

import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import { refreshAsksTokenJob } from "@/jobs/elasticsearch/asks/refresh-asks-token-job";
import { logger } from "@/common/logger";
import { refreshActivitiesTokenJob } from "@/jobs/elasticsearch/activities/refresh-activities-token-job";
import _ from "lodash";
import { ActivitiesTokenCache } from "@/models/activities-token-cache";
import { backfillTokenAsksJob } from "@/jobs/elasticsearch/asks/backfill-token-asks-job";
// import { Collections } from "@/models/collections";
// import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";

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

      try {
        // Update the elasticsearch activities token cache
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
          await ActivitiesTokenCache.refreshTokens(
            payload.after.contract,
            payload.after.token_id,
            payload.after
          );
        }
      } catch (error) {
        logger.error(
          "IndexerTokensHandler",
          JSON.stringify({
            message: `failed to update activities token cache. collectionId=${payload.after.id}, error=${error}`,
            error,
          })
        );
      }

      // Update the elasticsearch activities index
      if (changed.some((value) => ["is_spam", "nsfw_status"].includes(value))) {
        await refreshActivitiesTokenJob.addToQueue(payload.after.contract, payload.after.token_id);
      }

      // Update the elasticsearch asks index
      if (payload.after.floor_sell_id) {
        if (
          changed.some((value) =>
            ["is_flagged", "is_spam", "rarity_rank", "nsfw_status"].includes(value)
          )
        ) {
          await refreshAsksTokenJob.addToQueue(payload.after.contract, payload.after.token_id);
        }

        if (changed.some((value) => ["collection_id"].includes(value))) {
          await backfillTokenAsksJob.addToQueue(payload.after.contract, payload.after.token_id);
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

      if (
        payload.before.image !== null &&
        payload.after.image === null &&
        payload.after.media === null
      ) {
        logger.error(
          "IndexerTokensHandler",
          JSON.stringify({
            message: `token image missing.`,
            payload,
          })
        );

        // const collection = await Collections.getByContractAndTokenId(
        //   payload.after.contract,
        //   payload.after.token_id
        // );
        //
        // await metadataIndexFetchJob.addToQueue(
        //   [
        //     {
        //       kind: "single-token",
        //       data: {
        //         method: metadataIndexFetchJob.getIndexingMethod(collection?.community),
        //         contract: payload.after.contract,
        //         tokenId: payload.after.token_id,
        //         collection: collection?.id || payload.after.contract,
        //       },
        //       context: "IndexerTokensHandler",
        //     },
        //   ],
        //   true
        // );
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
