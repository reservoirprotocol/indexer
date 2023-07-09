import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import _ from "lodash";

import { PgPromiseQuery, idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import * as tokenSets from "@/orderbook/token-sets";

import { tokenRefreshCacheJob } from "@/jobs/token-updates/token-refresh-cache-job";
import { recalcTokenCountQueueJob } from "@/jobs/collection-updates/recalc-token-count-queue-job";
import { fetchCollectionMetadataJob } from "@/jobs/token-updates/fetch-collection-metadata-job";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";

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
              collections.id,
              collections.token_set_id,
              collections.community
            FROM collections
            WHERE collections.contract = $/contract/
              AND collections.token_id_range @> $/tokenId/::NUMERIC(78, 0)
            ORDER BY collections.created_at DESC
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
              UPDATE tokens SET
                collection_id = $/collection/,
                updated_at = now()
              WHERE tokens.contract = $/contract/
                AND tokens.token_id = $/tokenId/
                AND tokens.collection_id IS NULL
            `,
            values: {
              contract: toBuffer(contract),
              tokenId,
              collection: collection.id,
            },
          });

          // Include the new token to any collection-wide token set
          if (collection.token_set_id) {
            queries.push({
              query: `
                WITH x AS (
                  SELECT DISTINCT
                    token_sets.id
                  FROM token_sets
                  WHERE token_sets.id = $/tokenSetId/
                )
                INSERT INTO token_sets_tokens (
                  token_set_id,
                  contract,
                  token_id
                ) (
                  SELECT
                    x.id,
                    $/contract/,
                    $/tokenId/
                  FROM x
                ) ON CONFLICT DO NOTHING
              `,
              values: {
                contract: toBuffer(contract),
                tokenId,
                tokenSetId: collection.token_set_id,
              },
            });
          }

          // Trigger the queries
          await idb.none(pgp.helpers.concat(queries));

          // Schedule a job to re-count tokens in the collection
          await recalcTokenCountQueueJob.addToQueue({ collection: collection.id });

          // Refresh any dynamic token set
          const cacheKey = `refresh-collection-non-flagged-token-set:${collection.id}`;
          if (!(await redis.get(cacheKey))) {
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
              await tokenSets.dynamicCollectionNonFlagged.save(
                { collection: collection.id },
                undefined,
                true
              );
            }

            await redis.set(cacheKey, "locked", "EX", 10 * 60);
          }

          // Refresh the metadata for the new token
          if (!config.disableRealtimeMetadataRefresh) {
            const delay = getNetworkSettings().metadataMintDelay;
            const method = metadataIndexFetchJob.getIndexingMethod(collection.community);

            await metadataIndexFetchJob.addToQueue(
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
          await fetchCollectionMetadataJob.addToQueue([
            {
              contract,
              tokenId,
              mintedTimestamp,
              context: "mint-queue",
            },
          ]);
        }

        // Set any cached information (eg. floor sell)
        await tokenRefreshCacheJob.addToQueue({ contract, tokenId });
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
