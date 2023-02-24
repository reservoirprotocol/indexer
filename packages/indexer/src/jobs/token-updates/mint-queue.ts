import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import _ from "lodash";

import { PgPromiseQuery, idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import * as tokenSets from "@/orderbook/token-sets";

import * as collectionRecalcTokenCount from "@/jobs/collection-updates/recalc-token-count-queue";
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
            ORDER BY "c"."created_at" DESC
            LIMIT 1
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
              UPDATE "tokens" AS "t"
              SET "collection_id" = $/collection/,
                  "updated_at" = now()
              WHERE "t"."contract" = $/contract/
              AND "t"."token_id" = $/tokenId/
              AND "t"."collection_id" IS NULL;
            `,
            values: {
              contract: toBuffer(contract),
              tokenId,
              collection: collection.id,
            },
          });

          // Schedule a job to re-count tokens in the collection
          await collectionRecalcTokenCount.addToQueue(collection.id);

          // Include the new token to any collection-wide token set
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

          // Refresh any dynamic token set
          {
            const tokenSet = await tokenSets.dynamicCollectionNonFlagged.get({
              collection: collection.id,
            });
            const tokenSetResult = await idb.oneOrNone(
              `
                SELECT 1 FROM token_sets
                WHERE token_sets.id = $/id/
              `,
              {
                id: tokenSet.id,
              }
            );
            if (tokenSetResult) {
              await tokenSets.dynamicCollectionNonFlagged.update(
                { collection: collection.id },
                { contract, tokenId },
                "add"
              );
            }
          }

          await idb.none(pgp.helpers.concat(queries));

          if (!config.disableRealtimeMetadataRefresh) {
            let delay = getNetworkSettings().metadataMintDelay;
            let method = metadataIndexFetch.getIndexingMethod(collection.community);

            if (contract === "0x11708dc8a3ea69020f520c81250abb191b190110") {
              delay = 0;
              method = "simplehash";

              logger.info(
                QUEUE_NAME,
                `Forced rtfkt. contract=${contract}, tokenId=${tokenId}, delay=${delay}, method=${method}`
              );
            }

            await metadataIndexFetch.addToQueue(
              [
                {
                  kind: "single-token",
                  data: {
                    method,
                    contract,
                    tokenId,
                    collection: collection.id,
                  },
                },
              ],
              true,
              delay
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
    { connection: redis.duplicate(), concurrency: 30 }
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
  if (config.chainId === 137) {
    mintInfos = _.filter(
      mintInfos,
      (data) => data.contract !== "0xaa1ec1efef105599f849b8f5df9b937e25a16e6b"
    );

    if (_.isEmpty(mintInfos)) {
      return;
    }
  }

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
