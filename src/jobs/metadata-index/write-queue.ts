/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import _ from "lodash";
import { idb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as resyncAttributeKeyCounts from "@/jobs/update-attribute/resync-attribute-key-counts";
import * as resyncAttributeValueCounts from "@/jobs/update-attribute/resync-attribute-value-counts";
import * as rarityQueue from "@/jobs/collection-updates/rarity-queue";

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
      const { collection, contract, tokenId, name, description, imageUrl, mediaUrl, attributes } =
        job.data as TokenMetadataInfo;

      try {
        // Update the token's metadata.
        const result = await idb.oneOrNone(
          `
            UPDATE tokens SET
              name = $/name/,
              description = $/description/,
              image = $/image/,
              media = $/media/,
              updated_at = now()
            WHERE tokens.contract = $/contract/
              AND tokens.token_id = $/tokenId/
            RETURNING 1
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
        if (!result) {
          // Skip if there is no associated entry in the `tokens` table
          return;
        }

        // Clear the current token attributes
        const attributesToRefresh = await idb.manyOrNone(
          `WITH x AS (
                    DELETE FROM token_attributes
                    WHERE contract = $/contract/
                    AND token_id = $/tokenId/
                    RETURNING contract, token_id, attribute_id, collection_id, key, value, created_at
                   )
                   INSERT INTO removed_token_attributes SELECT * FROM x
                   ON CONFLICT (contract,token_id,attribute_id) DO UPDATE SET deleted_at = now()
                   RETURNING key, value, attribute_id;`,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );

        // Recalculate the collection rarity
        await rarityQueue.addToQueue(collection);

        // Schedule attribute refresh
        _.forEach(attributesToRefresh, (attribute) => {
          resyncAttributeKeyCounts.addToQueue(collection, attribute.key);
          resyncAttributeValueCounts.addToQueue(collection, attribute.key, attribute.value);
          (tokenAttributeCounter as any)[attribute.attribute_id] = -1;
        });

        // Token attributes
        for (const { key, value, kind, rank } of attributes) {
          // Try to update the attribute keys, if number type update range as well and return the ID
          let infoUpdate = "info"; // By default no update to the info
          if (kind == "number") {
            infoUpdate = `
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
          }

          let attributeKeyResult = await idb.oneOrNone(
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

          if (!attributeKeyResult?.id) {
            let info = null;
            if (kind == "number") {
              info = { min_range: Number(value), max_range: Number(value) };
            }

            // If no attribute key is available, then save it and refetch
            attributeKeyResult = await idb.oneOrNone(
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
          }

          if (!attributeKeyResult?.id) {
            // Otherwise, fail (and retry)
            throw new Error(`Could not fetch/save attribute key "${key}"`);
          }

          // Fetch the attribute from the database (will succeed in the common case)
          let attributeResult = await redb.oneOrNone(
            `
              SELECT id
              FROM attributes
              WHERE attribute_key_id = $/attributeKeyId/
              AND value = $/value/
            `,
            {
              attributeKeyId: attributeKeyResult.id,
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
                attributeKeyId: attributeKeyResult.id,
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

          let sampleImageUpdate = "";
          if (imageUrl) {
            sampleImageUpdate = `
              UPDATE attributes
              SET sample_images = CASE WHEN (sample_images IS NULL OR array_length(sample_images, 1) < 4) AND array_position(sample_images, $/image/) IS NULL
                      THEN array_prepend($/image/, sample_images)
                   WHEN (array_length(sample_images, 1) >= 4) AND array_position(sample_images, $/image/) IS NULL
                      THEN array_prepend($/image/, array_remove(sample_images, sample_images[4]))
                   ELSE sample_images
              END
              WHERE id = $/attributeId/;`;
          }

          // Associate the attribute with the token
          await idb.none(
            `
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
              ON CONFLICT DO NOTHING;
              
              ${sampleImageUpdate}
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

          if (_.has(tokenAttributeCounter, attributeResult.id)) {
            ++(tokenAttributeCounter as any)[attributeResult.id];
          } else {
            (tokenAttributeCounter as any)[attributeResult.id] = 1;
          }
        }

        // Update the attributes token count
        const replacementParams = {};
        let updateCountsString = "";

        _.forEach(tokenAttributeCounter, (count, attributeId) => {
          (replacementParams as any)[`${attributeId}`] = count;
          updateCountsString += `(${attributeId}, $/${attributeId}/),`;
        });

        updateCountsString = _.trimEnd(updateCountsString, ",");

        if (updateCountsString !== "") {
          const updateQuery = `UPDATE attributes
                             SET token_count = token_count + x.countColumn
                             FROM (VALUES ${updateCountsString}) AS x(idColumn, countColumn)
                             WHERE x.idColumn = attributes.id`;

          await idb.none(updateQuery, replacementParams);
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
