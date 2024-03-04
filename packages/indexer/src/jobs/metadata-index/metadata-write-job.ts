/* eslint-disable @typescript-eslint/no-explicit-any */

import { add, getUnixTime, isAfter } from "date-fns";
import _ from "lodash";
import PgPromise from "pg-promise";

import { idb, ridb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { rarityQueueJob } from "@/jobs/collection-updates/rarity-queue-job";
import { flagStatusUpdateJob } from "@/jobs/flag-status/flag-status-update-job";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { newCollectionForTokenJob } from "@/jobs/token-updates/new-collection-for-token-job";
import { resyncAttributeKeyCountsJob } from "@/jobs/update-attribute/resync-attribute-key-counts-job";
import { resyncAttributeValueCountsJob } from "@/jobs/update-attribute/resync-attribute-value-counts-job";
import { resyncAttributeCountsJob } from "@/jobs/update-attribute/update-attribute-counts-job";
import { tokenWebsocketEventsTriggerJob } from "@/jobs/websocket-events/token-websocket-events-trigger-job";
import { TokenMetadata } from "@/metadata/types";
import { refreshAsksTokenAttributesJob } from "@/jobs/elasticsearch/asks/refresh-asks-token-attributes-job";
import { redis } from "@/common/redis";

export type MetadataIndexWriteJobPayload = {
  collection: string;
  contract: string;
  tokenId: string;
  tokenURI: string;
  name?: string;
  description?: string;
  originalMetadata?: JSON;
  imageUrl?: string;
  imageOriginalUrl?: string;
  imageProperties?: {
    width?: number;
    height?: number;
    size?: number;
    mime_type?: string;
  };
  animationOriginalUrl?: string;
  metadataOriginalUrl?: string;
  mediaUrl?: string;
  flagged?: boolean;
  isFromWebhook?: boolean;
  attributes: {
    key: string;
    value: string;
    kind: "string" | "number" | "date" | "range";
    rank?: number;
  }[];
  decimals?: number;
  metadataMethod?: string;
  imageMimeType?: string;
  mediaMimeType?: string;
};

export default class MetadataIndexWriteJob extends AbstractRabbitMqJobHandler {
  queueName = "metadata-index-write-queue";
  maxRetries = 10;
  concurrency = config.chainId === 7777777 ? 10 : 40;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;
  disableErrorLogs = true;

  public async process(payload: MetadataIndexWriteJobPayload) {
    const tokenAttributeCounter = {};

    const {
      collection,
      contract,
      tokenId,
      tokenURI,
      name,
      description,
      originalMetadata,
      imageUrl,
      imageOriginalUrl,
      imageProperties,
      animationOriginalUrl,
      metadataOriginalUrl,
      mediaUrl,
      flagged,
      isFromWebhook,
      attributes,
      metadataMethod,
      imageMimeType,
      mediaMimeType,
      decimals,
    } = payload;

    const tokenMetadataIndexingDebug = await redis.sismember(
      "metadata-indexing-debug-contracts",
      contract
    );

    if (tokenMetadataIndexingDebug) {
      logger.info(
        this.queueName,
        JSON.stringify({
          topic: "tokenMetadataIndexingDebug",
          message: `Start. collection=${collection}, tokenId=${tokenId}, metadataMethod=${metadataMethod}`,
          payload,
          metadataMethod,
        })
      );
    }

    if (metadataMethod === "simplehash") {
      const debugSimplehashFallbackError = await redis.hget(
        "simplehash-fallback-debug-tokens-v2",
        `${contract}:${tokenId}`
      );

      if (debugSimplehashFallbackError) {
        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "simpleHashFallbackDebug",
            message: `Fallback. collection=${collection}, tokenId=${tokenId}`,
            payload,
            fallbackSuccess: name != null || imageUrl != null,
            fallbackError: debugSimplehashFallbackError,
          })
        );

        await redis.hdel("simplehash-fallback-debug-tokens-v2", `${contract}:${tokenId}`);
      }
    }

    // Update the token's metadata
    const result = await idb.oneOrNone(
      `
        WITH updated_check AS (
          SELECT
            CASE WHEN (name IS DISTINCT FROM $/name/
              OR image IS DISTINCT FROM $/image/
              OR media IS DISTINCT FROM $/media/
              OR token_uri IS DISTINCT FROM $/tokenURI/
              OR description IS DISTINCT FROM $/description/
              OR metadata IS DISTINCT FROM $/metadata:json/
              OR decimals IS DISTINCT FROM $/decimals/) THEN true
            ELSE false
            END AS is_updated
          FROM tokens
          WHERE tokens.contract = $/contract/
            AND tokens.token_id = $/tokenId/
        )
        UPDATE tokens SET
          name = $/name/,
          token_uri = $/tokenURI/,
          description = $/description/,
          image = $/image/,
          metadata = $/metadata:json/,
          media = $/media/,
          decimals = $/decimals/,
          updated_at = CASE
            WHEN (SELECT is_updated FROM updated_check) THEN now()
            ELSE updated_at
          END,
          image_version = CASE
            WHEN (SELECT is_updated FROM updated_check) THEN now()
            ELSE image_version
          END,
          collection_id = collection_id,
          created_at = created_at,
          metadata_indexed_at = CASE
            WHEN metadata_indexed_at IS NULL AND image IS NOT NULL THEN metadata_indexed_at
            WHEN metadata_indexed_at IS NULL THEN now()
            ELSE metadata_indexed_at
          END,
          metadata_initialized_at = CASE
            WHEN metadata_initialized_at IS NULL AND image IS NOT NULL THEN metadata_initialized_at
            WHEN metadata_initialized_at IS NULL AND COALESCE(image, $/image/) IS NOT NULL THEN now()
            ELSE metadata_initialized_at
          END,
          metadata_changed_at = CASE
            WHEN metadata_initialized_at IS NOT NULL AND NULLIF(image, $/image/) IS NOT NULL THEN now()
            ELSE metadata_changed_at
          END,
          metadata_updated_at = CASE
            WHEN (name IS DISTINCT FROM $/name/
              OR image IS DISTINCT FROM $/image/
              OR media IS DISTINCT FROM $/media/
              OR description IS DISTINCT FROM $/description/
              OR metadata IS DISTINCT FROM $/metadata:json/
              OR decimals IS DISTINCT FROM $/decimals/) THEN now()
            ELSE metadata_updated_at
          END
        WHERE tokens.contract = $/contract/
          AND tokens.token_id = $/tokenId/
        RETURNING collection_id, created_at, image, name, floor_sell_id
      `,
      {
        contract: toBuffer(contract),
        tokenId,
        name: _.isNull(name) ? null : `${name}`,
        description: description || null,
        image: imageUrl || null,
        tokenURI: tokenURI || null,
        decimals: decimals || null,
        metadata:
          {
            original_metadata: originalMetadata || null,
            image_original_url: imageOriginalUrl || null,
            image_mime_type: imageMimeType || null,
            image_properties: imageProperties || null,
            animation_original_url: animationOriginalUrl || null,
            media_mime_type: mediaMimeType || null,
            metadata_original_url: metadataOriginalUrl || null,
          } || {},
        media: mediaUrl || null,
      }
    );

    // Skip if there is no associated entry in the `tokens` table
    if (!result) {
      return;
    }

    // If the new collection ID is different from the collection ID currently stored
    if (
      !isFromWebhook &&
      result.collection_id !=
        "0x495f947276749ce646f68ac8c248420045cb7b5e:opensea-os-shared-storefront-collection" &&
      result.collection_id != collection
    ) {
      logger.info(
        this.queueName,
        `New collection ${collection} for contract=${contract}, tokenId=${tokenId}, old collection=${result.collection_id} isFromWebhook ${isFromWebhook}`
      );

      // Set the new collection and update the token association
      await newCollectionForTokenJob.addToQueue(
        [
          {
            contract,
            tokenId,
            mintedTimestamp: getUnixTime(new Date(result.created_at)),
            newCollectionId: collection,
            oldCollectionId: result.collection_id,
          },
        ],
        `${contract}:${tokenId}`
      );

      // Stop processing the token metadata
      return;
    }

    // If this is a new token and there's still no metadata (exclude mainnet)
    if (
      config.chainId !== 1 &&
      _.isNull(result.image) &&
      _.isNull(result.name) &&
      isAfter(add(new Date(result.created_at), { minutes: 25 }), Date.now())
    ) {
      // Requeue the token for metadata fetching and stop processing
      return metadataIndexFetchJob.addToQueue(
        [
          {
            kind: "single-token",
            data: {
              method: metadataMethod || config.metadataIndexingMethod,
              contract,
              tokenId,
              collection,
            },
            context: this.queueName,
          },
        ],
        false,
        20 * 60
      );
    }

    if (flagged != null) {
      await flagStatusUpdateJob.addToQueue([
        {
          contract,
          tokenId,
          isFlagged: Boolean(flagged),
        },
      ]);
    }

    // Fetch all existing keys
    const addedTokenAttributes = [];
    const attributeIds = [];
    const attributeKeysIds = await ridb.manyOrNone(
      `
        SELECT key, id, info, kind
        FROM attribute_keys
        WHERE collection_id = $/collection/
          AND key IN ('${_.join(
            _.map(attributes, (a) => PgPromise.as.value(a.key)),
            "','"
          )}')
      `,
      { collection }
    );

    const attributeKeysIdsMap = new Map(
      _.map(attributeKeysIds, (a) => [a.key, { id: a.id, info: a.info, kind: a.kind }])
    );

    // Token attributes
    for (const { key, value, kind, rank } of attributes) {
      if (
        attributeKeysIdsMap.has(key) &&
        kind == "number" &&
        (_.isNull(attributeKeysIdsMap.get(key)?.info) ||
          attributeKeysIdsMap.get(key)?.info.min_range > value ||
          attributeKeysIdsMap.get(key)?.info.max_range < value)
      ) {
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
            SET info = ${infoUpdate},
                kind = $/kind/,
                updated_at = now()
            WHERE collection_id = $/collection/
              AND key = $/key/
          `,
          {
            collection,
            key: String(key),
            value,
            kind,
          }
        );

        if (attributeKeysIdsMap.has(key) && attributeKeysIdsMap.get(key)?.kind !== kind) {
          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "attributeKindChangeDebug",
              message: `Kind changed - Updating attribute_keys. collection=${collection}, tokenId=${tokenId}`,
              payload,
              key,
              value,
              kind,
              rank,
              attributeKeysId: JSON.stringify(attributeKeysIdsMap.get(key)),
            })
          );
        }
        // If kind has changed, update it
        await idb.oneOrNone(
          `
            UPDATE attribute_keys
            SET kind = $/kind/,
                updated_at = now()
            WHERE collection_id = $/collection/
              AND key = $/key/
              AND kind IS DISTINCT FROM $/kind/
          `,
          {
            collection,
            key: String(key),
            kind,
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
        attributeKeysIdsMap.set(key, { id: attributeKeyResult.id, info, kind });
      }

      // Fetch the attribute from the database (will succeed in the common case)
      let attributeResult = await ridb.oneOrNone(
        `
          SELECT id, COALESCE(array_length(sample_images, 1), 0) AS "sample_images_length", kind
          FROM attributes
          WHERE attribute_key_id = $/attributeKeyId/
            AND value = $/value/
        `,
        {
          attributeKeyId: attributeKeysIdsMap.get(key)?.id,
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
            SET attribute_count = "attribute_count" + (SELECT COUNT(*) FROM "x"), updated_at = now()
            WHERE id = $/attributeKeyId/
            RETURNING (SELECT x.id FROM "x"), "attribute_count"
          `,
          {
            attributeKeyId: attributeKeysIdsMap.get(key)?.id,
            value: String(value),
            collection,
            kind,
            key: String(key),
          }
        );
      }

      if (!attributeResult?.id) {
        // Otherwise, fail (and retry)
        throw new Error(
          `Could not fetch/save attribute keyId ${
            attributeKeysIdsMap.get(key)?.id
          } key ${key} value ${value} attributeResult ${JSON.stringify(attributeResult)}`
        );
      }

      attributeIds.push(attributeResult.id);

      let sampleImageUpdate = "";
      if (imageUrl && attributeResult.sample_images_length < 4) {
        sampleImageUpdate = `
          UPDATE attributes
          SET sample_images = array_prepend($/image/, sample_images), updated_at = now()
          WHERE id = $/attributeId/
            AND (sample_images IS NULL OR array_length(sample_images, 1) < 4)
            AND array_position(sample_images, $/image/) IS NULL;
        `;
      }

      let kindUpdate = "";
      if (attributeResult.kind !== kind) {
        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "attributeKindChangeDebug",
            message: `Kind changed - Updating attributes. collection=${collection}, tokenId=${tokenId}`,
            payload,
            key,
            value,
            kind,
            rank,
            attributeResult: JSON.stringify(attributeResult),
          })
        );

        kindUpdate = `
          UPDATE attributes
          SET kind = $/kind/, updated_at = now()
          WHERE id = $/attributeId/
            AND kind IS DISTINCT FROM $/kind/;
        `;
      }

      // Associate the attribute with the token
      const tokenAttributeResult = await idb.oneOrNone(
        `
          ${sampleImageUpdate}
          ${kindUpdate}
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
          kind,
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
      `
        WITH x AS (
          DELETE FROM token_attributes
          WHERE contract = $/contract/
            AND token_id = $/tokenId/
            ${attributeIdsFilter}
          RETURNING contract, token_id, attribute_id, collection_id, key, value, created_at
        )
        INSERT INTO removed_token_attributes
        SELECT * FROM x
        ON CONFLICT (contract,token_id,attribute_id)
          DO UPDATE SET deleted_at = now()
        RETURNING key, value, attribute_id;
      `,
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
      resyncAttributeKeyCountsJob.addToQueue({ collection, key: attribute.key });
      resyncAttributeValueCountsJob.addToQueue({
        collection,
        key: attribute.key,
        value: attribute.value,
      });
    });

    // If any attributes changed
    if (!_.isEmpty(attributesToRefresh)) {
      await rarityQueueJob.addToQueue({ collectionId: collection }); // Recalculate the collection rarity

      await tokenWebsocketEventsTriggerJob.addToQueue([
        {
          kind: "ForcedChange",
          data: {
            contract,
            tokenId,
            changed: ["attributes"],
          },
        },
      ]);

      if (result.floor_sell_id) {
        await refreshAsksTokenAttributesJob.addToQueue(contract, tokenId, 5000);
      }
    }

    if (!_.isEmpty(tokenAttributeCounter)) {
      await resyncAttributeCountsJob.addToQueue({ tokenAttributeCounter });
    }
  }

  public async addToQueue(tokenMetadataInfos: TokenMetadata[]) {
    await this.sendBatch(
      tokenMetadataInfos
        .map((tokenMetadataInfo) => ({
          payload: tokenMetadataInfo,
        }))
        .filter(
          ({ payload }) =>
            payload.collection && payload.contract && payload.tokenId && payload.attributes
        )
    );
  }
}

export const metadataIndexWriteJob = new MetadataIndexWriteJob();
