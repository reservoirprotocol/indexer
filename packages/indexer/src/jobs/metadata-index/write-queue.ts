/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { getUnixTime } from "date-fns";
import _ from "lodash";

import { idb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";

import * as resyncAttributeKeyCounts from "@/jobs/update-attribute/resync-attribute-key-counts";
import * as resyncAttributeValueCounts from "@/jobs/update-attribute/resync-attribute-value-counts";
import * as rarityQueue from "@/jobs/collection-updates/rarity-queue";
import * as fetchCollectionMetadata from "@/jobs/token-updates/fetch-collection-metadata";
import * as flagStatusUpdate from "@/jobs/flag-status/update";
import * as updateCollectionActivity from "@/jobs/collection-updates/update-collection-activity";
import * as updateCollectionUserActivity from "@/jobs/collection-updates/update-collection-user-activity";
import * as updateCollectionDailyVolume from "@/jobs/collection-updates/update-collection-daily-volume";
import * as updateAttributeCounts from "@/jobs/update-attribute/update-attribute-counts";
import PgPromise from "pg-promise";
import { updateActivities } from "@/jobs/activities/utils";

const QUEUE_NAME = "metadata-index-write-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const tokenAttributeCounter = {};
      const {
        collection,
        contract,
        tokenId,
        name,
        description,
        imageUrl,
        mediaUrl,
        flagged,
        attributes,
      } = job.data as TokenMetadataInfo;

      try {
        // Update the token's metadata
        const result = await idb.oneOrNone(
          `
            UPDATE tokens SET
              name = $/name/,
              description = $/description/,
              image = $/image/,
              media = $/media/,
              updated_at = now(),
              collection_id = collection_id,
              created_at = created_at
            WHERE tokens.contract = $/contract/
            AND tokens.token_id = $/tokenId/
            RETURNING collection_id, created_at
          `,
          {
            contract: toBuffer(contract),
            tokenId,
            name: name || null,
            description: description || null,
            image: imageUrl || null,
            media: mediaUrl || null,
          }
        );

        // Skip if there is no associated entry in the `tokens` table
        if (!result) {
          return;
        }

        // If the new collection ID is different from the collection ID currently stored
        if (result.collection_id != collection) {
          logger.info(
            QUEUE_NAME,
            `New collection ${collection} for contract=${contract}, tokenId=${tokenId}, old collection=${result.collection_id}`
          );

          if (updateActivities(contract)) {
            // Update the activities to the new collection
            await updateCollectionActivity.addToQueue(
              collection,
              result.collection_id,
              contract,
              tokenId
            );

            await updateCollectionUserActivity.addToQueue(
              collection,
              result.collection_id,
              contract,
              tokenId
            );

            // Trigger a delayed job to recalc the daily volumes
            await updateCollectionDailyVolume.addToQueue(collection, contract);
          }

          // Set the new collection and update the token association
          await fetchCollectionMetadata.addToQueue(
            [
              {
                contract,
                tokenId,
                mintedTimestamp: getUnixTime(new Date(result.created_at)),
                newCollection: true,
              },
            ],
            `${contract}:${tokenId}`
          );

          return;
        }

        await flagStatusUpdate.addToQueue([
          {
            contract,
            tokenId,
            isFlagged: Boolean(flagged),
          },
        ]);

        // Fetch all existing keys
        const addedTokenAttributes = [];
        const attributeIds = [];
        const attributeKeysIds = await redb.manyOrNone(
          `
            SELECT key, id
            FROM attribute_keys
            WHERE collection_id = $/collection/
            AND key IN ('${_.join(
              _.map(attributes, (a) => PgPromise.as.value(a.key)),
              "','"
            )}')
          `,
          { collection }
        );

        const attributeKeysIdsMap = new Map(_.map(attributeKeysIds, (a) => [a.key, a.id]));

        // Token attributes
        for (const { key, value, kind, rank } of attributes) {
          if (attributeKeysIdsMap.has(key) && kind == "number") {
            // If number type try to update range as well and return the ID
            const infoUpdate = `
              CASE WHEN info IS NULL THEN 
                    jsonb_object(array['min_range', 'max_range'], array[$/value/, $/value/]::text[])
                  ELSE
                    info || jsonb_object(array['min_range', 'max_range'], array[
                          CASE
                              WHEN (info->>'min_range')::numeric > $/value/::numeric THEN $/value/::numeric
                              ELSE (info->>'min_range')::numeric
                          END,
                          CASE
                              WHEN (info->>'max_range')::numeric < $/value/::numeric THEN $/value/::numeric
                              ELSE (info->>'max_range')::numeric
                          END
                    ]::text[])
              END
            `;

            await idb.oneOrNone(
              `
                UPDATE attribute_keys
                SET info = ${infoUpdate}
                WHERE collection_id = $/collection/
                AND key = $/key/
                RETURNING id
              `,
              {
                collection,
                key: String(key),
                value,
              }
            );
          }

          // This is a new key, insert it and return the ID
          if (!attributeKeysIdsMap.has(key)) {
            let info = null;
            if (kind == "number") {
              info = { min_range: Number(value), max_range: Number(value) };
            }

            // If no attribute key is available, then save it and refetch
            const attributeKeyResult = await idb.oneOrNone(
              `
                INSERT INTO "attribute_keys" (
                  "collection_id",
                  "key",
                  "kind",
                  "rank",
                  "info"
                ) VALUES (
                  $/collection/,
                  $/key/,
                  $/kind/,
                  $/rank/,
                  $/info/
                )
                ON CONFLICT DO NOTHING
                RETURNING "id"
              `,
              {
                collection,
                key: String(key),
                kind,
                rank: rank || null,
                info,
              }
            );

            if (!attributeKeyResult?.id) {
              // Otherwise, fail (and retry)
              throw new Error(`Could not fetch/save attribute key "${key}"`);
            }

            // Add the new key and id to the map
            attributeKeysIdsMap.set(key, attributeKeyResult.id);
          }

          // Fetch the attribute from the database (will succeed in the common case)
          let attributeResult = await redb.oneOrNone(
            `
              SELECT id, COALESCE(array_length(sample_images, 1), 0) AS "sample_images_length"
              FROM attributes
              WHERE attribute_key_id = $/attributeKeyId/
              AND value = $/value/
            `,
            {
              attributeKeyId: attributeKeysIdsMap.get(key),
              value: String(value),
            }
          );

          if (!attributeResult?.id) {
            // If no attribute is not available, then save it and refetch
            attributeResult = await idb.oneOrNone(
              `
                WITH "x" AS (
                  INSERT INTO "attributes" (
                    "attribute_key_id",
                    "value",
                    "sell_updated_at",
                    "buy_updated_at",
                    "collection_id",
                    "kind",
                    "key"
                  ) VALUES (
                    $/attributeKeyId/,
                    $/value/,
                    NOW(),
                    NOW(),
                    $/collection/,
                    $/kind/,
                    $/key/
                  )
                  ON CONFLICT DO NOTHING
                  RETURNING "id"
                )
                
                UPDATE attribute_keys
                SET attribute_count = "attribute_count" + (SELECT COUNT(*) FROM "x")
                WHERE id = $/attributeKeyId/
                RETURNING (SELECT x.id FROM "x"), "attribute_count"
              `,
              {
                attributeKeyId: attributeKeysIdsMap.get(key),
                value: String(value),
                collection,
                kind,
                key: String(key),
              }
            );
          }

          if (!attributeResult?.id) {
            // Otherwise, fail (and retry)
            throw new Error(`Could not fetch/save attribute "${value}"`);
          }

          attributeIds.push(attributeResult.id);

          let sampleImageUpdate = "";
          if (imageUrl && attributeResult.sample_images_length < 4) {
            sampleImageUpdate = `
              UPDATE attributes
              SET sample_images = array_prepend($/image/, sample_images)
              WHERE id = $/attributeId/
              AND (sample_images IS NULL OR array_length(sample_images, 1) < 4)
              AND array_position(sample_images, $/image/) IS NULL;`;
          }

          // Associate the attribute with the token
          const tokenAttributeResult = await idb.oneOrNone(
            `
              ${sampleImageUpdate}
              INSERT INTO "token_attributes" (
                "contract",
                "token_id",
                "attribute_id",
                "collection_id",
                "key",
                "value"
              ) VALUES (
                $/contract/,
                $/tokenId/,
                $/attributeId/,
                $/collection/,
                $/key/,
                $/value/
              )
              ON CONFLICT DO NOTHING
              RETURNING key, value, attribute_id;
            `,
            {
              contract: toBuffer(contract),
              tokenId,
              attributeId: attributeResult.id,
              image: imageUrl || null,
              collection,
              key: String(key),
              value: String(value),
            }
          );

          if (tokenAttributeResult) {
            addedTokenAttributes.push(tokenAttributeResult);
            (tokenAttributeCounter as any)[attributeResult.id] = 1;
          }
        }

        let attributeIdsFilter = "";

        if (attributeIds.length) {
          attributeIdsFilter = `AND attribute_id NOT IN ($/attributeIds:raw/)`;
        }

        // Clear deleted token attributes
        const removedTokenAttributes = await idb.manyOrNone(
          `WITH x AS (
                    DELETE FROM token_attributes
                    WHERE contract = $/contract/
                    AND token_id = $/tokenId/
                    ${attributeIdsFilter}
                    RETURNING contract, token_id, attribute_id, collection_id, key, value, created_at
                   )
                   INSERT INTO removed_token_attributes SELECT * FROM x
                   ON CONFLICT (contract,token_id,attribute_id) DO UPDATE SET deleted_at = now()
                   RETURNING key, value, attribute_id;`,
          {
            contract: toBuffer(contract),
            tokenId,
            attributeIds: _.join(attributeIds, ","),
          }
        );

        // Schedule attribute refresh
        _.forEach(removedTokenAttributes, (attribute) => {
          (tokenAttributeCounter as any)[attribute.attribute_id] = -1;
        });

        const attributesToRefresh = addedTokenAttributes.concat(removedTokenAttributes);

        // Schedule attribute refresh
        _.forEach(attributesToRefresh, (attribute) => {
          resyncAttributeKeyCounts.addToQueue(collection, attribute.key);
          resyncAttributeValueCounts.addToQueue(collection, attribute.key, attribute.value);
        });

        // If any attributes changed
        if (!_.isEmpty(attributesToRefresh)) {
          await rarityQueue.addToQueue(collection); // Recalculate the collection rarity
        }

        if (!_.isEmpty(tokenAttributeCounter)) {
          await updateAttributeCounts.addToQueue(tokenAttributeCounter);
        }

        // Mark the token as having metadata indexed.
        await idb.none(
          `
            UPDATE tokens SET metadata_indexed = TRUE, updated_at = now()
            WHERE tokens.contract = $/contract/
              AND tokens.token_id = $/tokenId/
              AND tokens.metadata_indexed IS DISTINCT FROM TRUE
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to process token metadata info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 30 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type TokenMetadataInfo = {
  collection: string;
  contract: string;
  tokenId: string;
  name?: string;
  description?: string;
  imageUrl?: string;
  mediaUrl?: string;
  flagged?: boolean;
  attributes: {
    key: string;
    value: string;
    kind: "string" | "number" | "date" | "range";
    rank?: number;
  }[];
};

export const addToQueue = async (tokenMetadataInfos: TokenMetadataInfo[]) => {
  await queue.addBulk(
    tokenMetadataInfos
      .map((tokenMetadataInfo) => ({
        name: `${tokenMetadataInfo.contract}-${tokenMetadataInfo.tokenId}`,
        data: tokenMetadataInfo,
      }))
      .filter(({ data }) => data.collection && data.contract && data.tokenId && data.attributes)
  );
};
