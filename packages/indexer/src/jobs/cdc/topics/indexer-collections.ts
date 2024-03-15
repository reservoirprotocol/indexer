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
import { ActivitiesCollectionCache } from "@/models/activities-collection-cache";
import { updateUserCollectionsSpamJob } from "@/jobs/nft-balance-updates/update-user-collections-spam-job";

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

    const changed = [];

    for (const key in payload.after) {
      const beforeValue = payload.before[key];
      const afterValue = payload.after[key];

      if (beforeValue !== afterValue) {
        changed.push(key);
      }
    }

    try {
      // Update the elasticsearch activities collection cache
      if (changed.some((value) => ["name", "image", "image_version"].includes(value))) {
        await ActivitiesCollectionCache.refreshCollection(payload.after.id, payload.after);
      }
    } catch (error) {
      logger.error(
        "IndexerCollectionsHandler",
        JSON.stringify({
          message: `failed to update activities collection cache. collectionId=${payload.after.id}, error=${error}`,
          error,
        })
      );
    }

    try {
      const collectionKey = `collection-cache:v7:${payload.after.id}`;

      const cachedCollection = await redis.get(collectionKey);

      if (cachedCollection !== null) {
        // If the collection exists, fetch the on_sale_count
        const collectionMetadataQuery = `
          SELECT
            count_query.on_sale_count,
            fs.currency AS floor_sell_currency,
            fs.currency_normalized_value AS normalized_floor_sell_currency_value,
            fs.currency_value AS floor_sell_currency_value,
            tb.currency AS top_buy_currency,
            tb.price AS top_buy_price,
            tb.currency_price AS top_buy_currency_price,
            tb.normalized_value AS top_buy_normalized_value,
            tb.currency_value AS top_buy_currency_value,
            tb.currency_normalized_value AS top_buy_currency_normalized_value,
            tb.maker AS top_buy_maker,
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
          LEFT JOIN orders fs ON fs.id = $/askOrderId/
          LEFT JOIN orders tb ON tb.id = $/topBidOrderId/;
        `;

        const result = await redb.one(collectionMetadataQuery, {
          collectionId: payload.after.id,
          askOrderId: payload.after.floor_sell_id,
          topBidOrderId: payload.after.top_buy_id,
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
          },
          sample_images: result?.sample_images || [],
          on_sale_count: result.on_sale_count,
          normalized_floor_sell_currency_value: result.normalized_floor_sell_currency_value,
          floor_sell_currency_value: result.floor_sell_currency_value,
          top_buy_currency: result.top_buy_currency
            ? fromBuffer(result.top_buy_currency)
            : Sdk.Common.Addresses.Native[config.chainId],
          top_buy_maker: result.top_buy_maker ? fromBuffer(result.top_buy_maker) : null,
          top_buy_price: result.top_buy_price,
          top_buy_currency_price: result.top_buy_currency_price,
          top_buy_normalized_value: result.top_buy_normalized_value,
          top_buy_currency_value: result.top_buy_currency_value,
          top_buy_currency_normalized_value: result.top_buy_currency_normalized_value,
        };

        await redis.set(collectionKey, JSON.stringify(updatedPayload), "XX", "KEEPTTL");
      }

      const isSpam = Number(payload.after.is_spam) > 0;

      // If name changed
      const nameChanged = payload.before.name !== payload.after.name;

      // If the collection url changed
      const urlChanged =
        payload.before?.metadata?.externalUrl !== payload.after?.metadata?.externalUrl;

      // If the collections was marked as verified
      const verificationChanged =
        payload.before?.metadata?.safelistRequestStatus !==
          payload.after?.metadata?.safelistRequestStatus &&
        payload.after?.metadata?.safelistRequestStatus === "verified";

      // If the name/url/verification changed check for spam
      if (((nameChanged || urlChanged) && !isSpam) || (verificationChanged && isSpam)) {
        // await collectionCheckSpamJob.addToQueue({
        //   collectionId: payload.after.id,
        //   trigger: "metadata-changed",
        // });
      }

      // Update the elasticsearch activities index
      if (changed.some((value) => ["is_spam", "nsfw_status"].includes(value))) {
        const spamStatusChanged = payload.before.is_spam > 0 !== payload.after.is_spam > 0;
        const nsfwStatusChanged = payload.before.nsfw_status > 0 !== payload.after.nsfw_status > 0;

        if (spamStatusChanged || nsfwStatusChanged) {
          if (spamStatusChanged) {
            await updateUserCollectionsSpamJob.addToQueue({
              collectionId: payload.after.id,
              newSpamState: payload.after.is_spam,
            });
          }

          logger.info(
            "cdc-indexer-collections",
            JSON.stringify({
              topic: "debugActivitiesErrors",
              message: `change detected. collectionId=${payload.after.id}, is_spam before=${payload.before.is_spam}, after=${payload.after.is_spam}, nsfw_status before=${payload.before.nsfw_status}, after=${payload.after.nsfw_status}`,
              collectionId: payload.after.id,
              spamStatusChanged,
              nsfwStatusChanged,
            })
          );

          await refreshActivitiesCollectionMetadataJob.addToQueue({
            collectionId: payload.after.id,
          });

          // Update the elasticsearch asks index
          if (payload.after.floor_sell_id) {
            await refreshAsksCollectionJob.addToQueue(payload.after.id);
          }
        }
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
