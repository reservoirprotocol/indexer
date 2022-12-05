/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { PgPromiseQuery, idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import * as tokenRefreshCache from "@/jobs/token-updates/token-refresh-cache";
import * as fetchCollectionMetadata from "@/jobs/token-updates/fetch-collection-metadata";

const QUEUE_NAME = "token-updates-mint-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 1000,
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
      const { contract, tokenId, mintedTimestamp } = job.data as MintInfo;

      try {
        // First, check the database for any matching collection
        const collection: {
          id: string;
          token_set_id: string | null;
          community: string | null;
        } | null = await idb.oneOrNone(
          `
            SELECT
              "c"."id",
              "c"."token_set_id",
              "c"."community"
            FROM "collections" "c"
            WHERE "c"."contract" = $/contract/
              AND "c"."token_id_range" @> $/tokenId/::NUMERIC(78, 0)
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );

        if (collection) {
          const queries: PgPromiseQuery[] = [];

          // If the collection is readily available in the database then
          // all we needed to do is to associate it with the token
          queries.push({
            query: `
              WITH "x" AS (
                UPDATE "tokens" AS "t" SET
                  "collection_id" = $/collection/,
                  "updated_at" = now()
                WHERE "t"."contract" = $/contract/
                  AND "t"."token_id" = $/tokenId/
                  AND "t"."collection_id" IS NULL
                RETURNING 1
              )
              UPDATE "collections" SET
                "token_count" = "token_count" + (SELECT COUNT(*) FROM "x"),
                "updated_at" = now()
              WHERE "id" = $/collection/
            `,
            values: {
              contract: toBuffer(contract),
              tokenId,
              collection: collection.id,
            },
          });

          // We also need to include the new token to any collection-wide token set
          if (collection.token_set_id) {
            queries.push({
              query: `
                WITH "x" AS (
                  SELECT DISTINCT
                    "ts"."id"
                  FROM "token_sets" "ts"
                  WHERE "ts"."id" = $/tokenSetId/
                )
                INSERT INTO "token_sets_tokens" (
                  "token_set_id",
                  "contract",
                  "token_id"
                ) (
                  SELECT
                    "x"."id",
                    $/contract/,
                    $/tokenId/
                  FROM "x"
                ) ON CONFLICT DO NOTHING
              `,
              values: {
                contract: toBuffer(contract),
                tokenId,
                tokenSetId: collection.token_set_id,
              },
            });
          }

          await idb.none(pgp.helpers.concat(queries));

          if (!config.disableRealtimeMetadataRefresh) {
            await metadataIndexFetch.addToQueue(
              [
                {
                  kind: "single-token",
                  data: {
                    method: metadataIndexFetch.getIndexingMethod(collection.community),
                    contract,
                    tokenId,
                    collection: collection.id,
                  },
                },
              ],
              true,
              getNetworkSettings().metadataMintDelay
            );
          }
        } else {
          // We fetch the collection metadata from upstream
          await fetchCollectionMetadata.addToQueue([
            {
              contract,
              tokenId,
              mintedTimestamp,
            },
          ]);
        }

        // Set any cached information (eg. floor sell)
        await tokenRefreshCache.addToQueue(contract, tokenId);
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to process mint info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type MintInfo = {
  contract: string;
  tokenId: string;
  mintedTimestamp: number;
};

export const addToQueue = async (mintInfos: MintInfo[]) => {
  await queue.addBulk(
    mintInfos.map((mintInfo) => ({
      name: `${mintInfo.contract}-${mintInfo.tokenId}`,
      data: mintInfo,
      opts: {
        // Deterministic job id so that we don't perform duplicated work
        jobId: `${mintInfo.contract}-${mintInfo.tokenId}`,
      },
    }))
  );
};
