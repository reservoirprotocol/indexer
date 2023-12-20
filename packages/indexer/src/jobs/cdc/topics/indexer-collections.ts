/* eslint-disable @typescript-eslint/no-explicit-any */
import { KafkaEventHandler } from "./KafkaEventHandler";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { fromBuffer } from "@/common/utils";
import * as Sdk from "@reservoir0x/sdk";

import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { refreshAsksCollectionJob } from "@/jobs/elasticsearch/asks/refresh-asks-collection-job";
import { refreshActivitiesCollectionMetadataJob } from "@/jobs/elasticsearch/activities/refresh-activities-collection-metadata-job";
import {
  EventKind,
  processCollectionEventJob,
} from "@/jobs/elasticsearch/collections/process-collection-event-job";

export class IndexerCollectionsHandler extends KafkaEventHandler {
  topicName = "indexer.public.collections";

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
      eventKind: WebsocketEventKind.CollectionEvent,
    });

    // Update the elasticsearch collections index
    await processCollectionEventJob.addToQueue([
      {
        kind: EventKind.newCollection,
        data: {
          id: payload.after.id,
        },
      },
    ]);
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
      eventKind: WebsocketEventKind.CollectionEvent,
    });

    try {
      logger.info("top-selling-collections", `updating ${payload.after.id}`);
      const collectionKey = `collection-cache:v5:${payload.after.id}`;

      const cachedCollection = await redis.get(collectionKey);

      if (cachedCollection !== null) {
        // If the collection exists, fetch the on_sale_count
        const collectionMetadataQuery = `
        SELECT
        count_query.on_sale_count,
        orders.currency AS floor_sell_currency,
        orders.currency_normalized_value AS normalized_floor_sell_currency_value,
        orders.currency_value AS floor_sell_currency_value,
        (
          ARRAY( 
            SELECT 
              tokens.image
            FROM tokens
            WHERE tokens.collection_id = $/collectionId/ 
            ORDER BY rarity_rank DESC NULLS LAST 
            LIMIT 4 
          )
        ) AS sample_images
      FROM (
        SELECT
          COUNT(*) AS on_sale_count
          FROM tokens
          WHERE tokens.collection_id = $/collectionId/
          AND tokens.floor_sell_value IS NOT NULL
      ) AS count_query 
      LEFT JOIN orders ON orders.id = $/askOrderId/;
        `;

        const result = await redb.one(collectionMetadataQuery, {
          collectionId: payload.after.id,
          askOrderId: payload.after.floor_sell_id,
        });

        const { contract, metadata, ...updatedCollection } = payload.after;

        const updatedPayload = {
          ...updatedCollection,
          contract: fromBuffer(contract),
          floor_sell_currency: result.floor_sell_currency
            ? fromBuffer(result.floor_sell_currency)
            : Sdk.Common.Addresses.Native[config.chainId],
          metadata: {
            ...JSON.parse(metadata),
            sample_images: result?.sample_images || [],
          },
          on_sale_count: result.on_sale_count,
          normalized_floor_sell_currency_value: result.normalized_floor_sell_currency_value,
          floor_sell_currency_value: result.floor_sell_currency_value,
        };

        await redis.set(collectionKey, JSON.stringify(updatedPayload), "XX");
      }

      const spamStatusChanged = payload.before.is_spam !== payload.after.is_spam;

      // Update the elasticsearch activities index
      if (spamStatusChanged) {
        logger.info(
          "cdc-indexer-collections",
          JSON.stringify({
            topic: "debugActivitiesErrors",
            message: `spamStatusChanged. collectionId=${payload.after.id}, before=${payload.before.is_spam}, after=${payload.after.is_spam}`,
            collectionId: payload.after.id,
          })
        );

        await refreshActivitiesCollectionMetadataJob.addToQueue({
          collectionId: payload.after.id,
          context: "spamStatusChanged",
        });
      }

      // Update the elasticsearch asks index
      if (payload.after.floor_sell_id && spamStatusChanged) {
        await refreshAsksCollectionJob.addToQueue(payload.after.id);
      }

      // Update the elasticsearch collections index
      await processCollectionEventJob.addToQueue([
        {
          kind: EventKind.collectionUpdated,
          data: {
            id: payload.after.id,
          },
        },
      ]);
    } catch (err) {
      logger.error(
        "top-selling-collections",
        `failed to update collection ${payload.after.id}, ${err}`
      );
    }
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
