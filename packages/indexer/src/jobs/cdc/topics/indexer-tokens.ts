/* eslint-disable @typescript-eslint/no-explicit-any */

import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import { refreshAsksTokenJob } from "@/jobs/elasticsearch/asks/refresh-asks-token-job";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";

import { refreshActivitiesTokenJob } from "@/jobs/elasticsearch/activities/refresh-activities-token-job";
import _ from "lodash";
import { ActivitiesTokenCache } from "@/models/activities-token-cache";
import { backfillTokenAsksJob } from "@/jobs/elasticsearch/asks/backfill-token-asks-job";
import { Collections } from "@/models/collections";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { config } from "@/config/index";
import { recalcOnSaleCountQueueJob } from "@/jobs/collection-updates/recalc-on-sale-count-queue-job";
import { getNetworkSettings } from "@/config/network";

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

    const changed = [];

    for (const key in payload.after) {
      const beforeValue = payload.before[key];
      const afterValue = payload.after[key];

      if (beforeValue !== afterValue) {
        changed.push(key);
      }
    }

    if (
      [1, 11155111].includes(config.chainId) &&
      config.debugWsApiKey &&
      getNetworkSettings().multiCollectionContracts.includes(payload.after.contract)
    ) {
      if (changed.some((value) => ["normalized_floor_sell_id"].includes(value))) {
        logger.info(
          "IndexerTokensHandler",
          JSON.stringify({
            topic: "debugMissingTokenNormalizedFloorAskChangedEvents",
            message: `normalizedFloorSellIdChanged. collectionId=${payload.after.collection_id}, contract=${payload.after.contract}, tokenId=${payload.after.token_id}`,
            collectionId: payload.after.collection_id,
            contract: payload.after.contract,
            tokenId: payload.after.token_id,
            payload: JSON.stringify(payload),
          })
        );
      }
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
            message: `failed to update activities token cache. contract=${payload.after.contract}, tokenId=${payload.after.token_id}, error=${error}`,
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
          await backfillTokenAsksJob.addToQueue(
            payload.after.contract,
            payload.after.token_id,
            true
          );
        }
      }

      // If the token was listed or listing was removed update the onSaleCount
      if (
        payload.after.collection_id &&
        changed.some((value) => ["floor_sell_id"].includes(value)) &&
        (!payload.before.floor_sell_id || !payload.after.floor_sell_id)
      ) {
        await recalcOnSaleCountQueueJob.addToQueue({ collection: payload.after.collection_id });
      }

      const metadataInitializedAtChanged =
        payload.before.metadata_initialized_at !== payload.after.metadata_initialized_at;

      if (metadataInitializedAtChanged && _.random(100) <= 25) {
        const indexedLatency = Math.floor(
          (new Date(payload.after.metadata_indexed_at).getTime() -
            new Date(payload.after.created_at).getTime()) /
            1000
        );

        if (indexedLatency >= 120 && config.chainId != 204) {
          // if (config.chainId === 137) {
          //   const count = await redis.incr(
          //     `token-metadata-latency-debug:${payload.after.contract}`
          //   );
          //   await redis.expire(`token-metadata-latency-debug:${payload.after.contract}`, 600);
          //
          //   if (count >= 10) {
          //     redis.sadd("metadata-indexing-debug-contracts", payload.after.contract);
          //   }
          // }

          logger.warn(
            "token-metadata-latency-metric",
            JSON.stringify({
              topic: "latency-metrics",
              contract: payload.after.contract,
              tokenId: payload.after.token_id,
              indexedLatency,
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
        } else {
          logger.info(
            "token-metadata-latency-metric",
            JSON.stringify({
              topic: "latency-metrics",
              contract: payload.after.contract,
              tokenId: payload.after.token_id,
              indexedLatency,
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
      }

      if (
        payload.before.image !== null &&
        payload.after.image === null &&
        payload.after.media === null
      ) {
        if (config.chainId === 1) {
          redis.sadd("metadata-indexing-debug-contracts", payload.after.contract);
        }

        logger.error(
          "IndexerTokensHandler",
          JSON.stringify({
            message: `token image missing. contract=${payload.after.contract}, tokenId=${payload.after.token_id}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
            payload,
          })
        );

        if (config.fallbackMetadataIndexingMethod) {
          const collection = await Collections.getByContractAndTokenId(
            payload.after.contract,
            payload.after.token_id
          );

          await metadataIndexFetchJob.addToQueue(
            [
              {
                kind: "single-token",
                data: {
                  method: config.fallbackMetadataIndexingMethod,
                  contract: payload.after.contract,
                  tokenId: payload.after.token_id,
                  collection: collection?.id || payload.after.contract,
                },
                context: "IndexerTokensHandler",
              },
            ],
            true,
            30
          );
        }
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
