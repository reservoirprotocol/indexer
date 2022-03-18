import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const QUEUE_NAME = "metadata-index-write-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 10000,
    removeOnFail: 10000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const {
        collection,
        contract,
        tokenId,
        name,
        description,
        imageUrl,
        attributes,
      } = job.data as TokenMetadataInfo;

      try {
        // Prepare the attributes for caching in the `tokens` table.
        const attrs: string[] = [];
        const attrsParams: { [key: string]: string } = {};
        for (let i = 0; i < attributes.length; i++) {
          attrs.push(`[$/attribute${i}/, NULL]`);
          attrsParams[
            `attribute${i}`
          ] = `${attributes[i].key},${attributes[i].value}`;
        }

        // Update the token's metadata.
        const result = await idb.oneOrNone(
          `
            UPDATE tokens SET
              name = $/name/,
              description = $/description/,
              image = $/image/,
              attributes = ${
                attrs.length ? `HSTORE(ARRAY[${attrs.join(", ")}])` : "NULL"
              },
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
            ...attrsParams,
          }
        );
        if (!result) {
          // Skip if there is no associated entry in the `tokens` table
          return;
        }

        // Delete all previous attributes of the token.
        // TODO: Token reindexing seems to mess up the `token_count`
        // cached inside each attribute. We should investigate what
        // causes it (probably concurrent writes) and fix the issue.
        await idb.none(
          `
            WITH x AS (
              DELETE FROM token_attributes
              WHERE token_attributes.contract = $/contract/
                AND token_attributes.token_id = $/tokenId/
              RETURNING token_attributes.attribute_id
            )
            UPDATE attributes SET
              token_count = token_count - 1
            FROM x
            WHERE attributes.id = x.attribute_id
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );

        // Token attributes
        for (const { key, value, kind, rank } of attributes) {
          // Fetch the attribute key from the database (will succeed in the common case)
          let attributeKeyResult = await idb.oneOrNone(
            `
              SELECT "ak"."id" FROM "attribute_keys" "ak"
              WHERE "ak"."collection_id" = $/collection/
                AND "ak"."key" = $/key/
            `,
            {
              collection,
              key: String(key),
            }
          );

          if (!attributeKeyResult?.id) {
            // If no attribute key is available, then save it and refetch
            attributeKeyResult = await idb.oneOrNone(
              `
                INSERT INTO "attribute_keys" (
                  "collection_id",
                  "key",
                  "kind",
                  "rank"
                ) VALUES (
                  $/collection/,
                  $/key/,
                  $/kind/,
                  $/rank/
                )
                ON CONFLICT DO NOTHING
                RETURNING "id"
              `,
              {
                collection,
                key: String(key),
                kind,
                rank: rank || null,
              }
            );
          }

          if (!attributeKeyResult?.id) {
            // Otherwise, fail (and retry)
            throw new Error(`Could not fetch/save attribute key "${key}"`);
          }

          // Fetch the attribute from the database (will succeed in the common case)
          let attributeResult = await idb.oneOrNone(
            `
              SELECT "a"."id" FROM "attributes" "a"
              WHERE "a"."attribute_key_id" = $/attributeKeyId/
                AND "a"."value" = $/value/
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
                    "value"
                  ) VALUES (
                    $/attributeKeyId/,
                    $/value/
                  )
                  ON CONFLICT DO NOTHING
                  RETURNING "id"
                )
                UPDATE "attribute_keys" SET
                  "attribute_count" = "attribute_count" + (SELECT COUNT(*) FROM "x")
                WHERE "id" = $/attributeKeyId/
                RETURNING (SELECT "x"."id" FROM "x"), "attribute_count"
              `,
              {
                attributeKeyId: attributeKeyResult.id,
                value: String(value),
                collection,
              }
            );
          }

          if (!attributeResult?.id) {
            // Otherwise, fail (and retry)
            throw new Error(`Could not fetch/save attribute "${value}"`);
          }

          // Associate the attribute with the token
          await idb.none(
            `
              WITH "x" AS (
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
                RETURNING 1
              )
              UPDATE "attributes" SET
                "token_count" = "token_count" + (SELECT COUNT(*) FROM "x")
              WHERE "id" = $/attributeId/
            `,
            {
              contract: toBuffer(contract),
              tokenId,
              attributeId: attributeResult.id,
              collection,
              key: String(key),
              value: String(value),
            }
          );
        }

        // Mark the token as having metadata indexed.
        await idb.none(
          `
            UPDATE tokens SET metadata_indexed = TRUE
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
          `Failed to process token metadata info ${JSON.stringify(
            job.data
          )}: ${error}`
        );
        throw error;
      }
    },
    // No concurrency here to avoid any possible deadlocks.
    { connection: redis.duplicate() }
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
  attributes: {
    key: string;
    value: string;
    kind: "string" | "number" | "date" | "range";
    rank?: number;
  }[];
};

export const addToQueue = async (tokenMetadataInfos: TokenMetadataInfo[]) => {
  await queue.addBulk(
    tokenMetadataInfos.map((tokenMetadataInfo) => ({
      name: `${tokenMetadataInfo.contract}-${tokenMetadataInfo.tokenId}`,
      data: tokenMetadataInfo,
    }))
  );
};
