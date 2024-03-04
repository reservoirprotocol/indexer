import { idb, pgp, PgPromiseQuery } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { recalcTokenCountQueueJob } from "@/jobs/collection-updates/recalc-token-count-queue-job";
import { acquireLock, redis } from "@/common/redis";
import * as tokenSets from "@/orderbook/token-sets";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { tokenRefreshCacheJob } from "@/jobs/token-updates/token-refresh-cache-job";
import _ from "lodash";
import { fetchCollectionMetadataJob } from "@/jobs/token-updates/fetch-collection-metadata-job";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { collectionMetadataQueueJob } from "../collection-updates/collection-metadata-queue-job";

export type MintQueueJobPayload = {
  contract: string;
  tokenId: string;
  mintedTimestamp: number;
  context?: string;
};

export default class MintQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "token-updates-mint-queue";
  maxRetries = 10;
  concurrency = 30;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  public async process(payload: MintQueueJobPayload) {
    const { contract, tokenId, mintedTimestamp } = payload;

    try {
      // First, check the database for any matching collection
      const collection: {
        id: string;
        token_set_id: string | null;
        community: string | null;
        token_indexing_method: string | null;
        token_count: number;
      } | null = await idb.oneOrNone(
        `
            SELECT
              collections.id,
              collections.token_set_id,
              collections.community,
              token_indexing_method,
              token_count
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

      let isFirstToken = false;

      // check if there are any tokens that exist already for the collection
      // if there are not, we need to fetch the collection metadata from upstream
      if (collection) {
        // If the collection is readily available in the database then check if the token already exists / or the first token in the colleciton
        const existingToken = await idb.oneOrNone(
          `
              SELECT token_id
              FROM tokens
              WHERE tokens.contract = $/contract/
                AND tokens.collection_id = $/collection/
                AND tokens.token_id = $/tokenId/
              UNION ALL
              SELECT token_id
              FROM tokens
              WHERE tokens.contract = $/contract/
                AND tokens.collection_id = $/collection/
                AND NOT EXISTS
                  (SELECT 1
                   FROM tokens
                   WHERE tokens.contract = $/contract/
                     AND tokens.collection_id = $/collection/
                     AND tokens.token_id = $/tokenId/)
              LIMIT 1
          `,
          {
            contract: toBuffer(contract),
            collection: collection.id,
            tokenId: tokenId,
          }
        );

        if (!existingToken) {
          isFirstToken = true;
        }

        if (existingToken?.token_id !== tokenId) {
          // If it's the first time we see this token id (for erc1155, its possible we would already have the token)
          const queries: PgPromiseQuery[] = [];

          // associate collection with the token
          queries.push({
            query: `
              UPDATE tokens SET
                collection_id = $/collection/,
                updated_at = now()
              WHERE tokens.contract = $/contract/
                AND tokens.token_id = $/tokenId/
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
            const method = metadataIndexFetchJob.getIndexingMethod(collection);

            await acquireLock(`refresh-new-token-metadata:${contract}:${tokenId}`, 10);

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
                  context: this.queueName,
                },
              ],
              true,
              delay
            );
          }
        }

        // Schedule a job to re-count tokens in the collection with different delays based on the amount of tokens
        let delay = 5 * 60 * 1000;
        if (collection.token_count > 200000) {
          delay = 24 * 60 * 60 * 1000;
        } else if (collection.token_count > 25000) {
          delay = 60 * 60 * 1000;
        }

        await recalcTokenCountQueueJob.addToQueue({ collection: collection.id }, delay);
      } else {
        // We fetch the collection metadata from upstream
        await fetchCollectionMetadataJob.addToQueue([
          {
            contract,
            tokenId,
            mintedTimestamp,
          },
        ]);
      }

      if (isFirstToken) {
        await collectionMetadataQueueJob.addToQueue({
          contract,
          tokenId,
          community: collection?.community ?? null,
        });

        // update the minted timestamp on the collection
        await idb.none(
          `
            UPDATE collections SET
              minted_timestamp = $/mintedTimestamp/,
              updated_at = NOW()
            WHERE collections.id = $/collection/
            AND collections.minted_timestamp IS NULL
          `,
          {
            collection: collection?.id,
            mintedTimestamp,
          }
        );
      }

      // Set any cached information (eg. floor sell)
      await tokenRefreshCacheJob.addToQueue({ contract, tokenId });
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to process mint info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(mintInfos: MintQueueJobPayload[]) {
    if (config.chainId === 137) {
      mintInfos = _.filter(
        mintInfos,
        (data) => data.contract !== "0xaa1ec1efef105599f849b8f5df9b937e25a16e6b"
      );

      if (_.isEmpty(mintInfos)) {
        return;
      }
    }

    await this.sendBatch(
      mintInfos.map((mintInfo) => ({
        payload: mintInfo,
        jobId: `${mintInfo.contract}-${mintInfo.tokenId}`,
      }))
    );
  }
}

export const mintQueueJob = new MintQueueJob();
