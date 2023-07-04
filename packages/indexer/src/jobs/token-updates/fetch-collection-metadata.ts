/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import _ from "lodash";

import { PgPromiseQuery, idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import MetadataApi from "@/utils/metadata-api";
import * as royalties from "@/utils/royalties";
import * as marketplaceFees from "@/utils/marketplace-fees";

import { recalcOwnerCountQueueJob } from "@/jobs/collection-updates/recalc-owner-count-queue-job";
import { recalcTokenCountQueueJob } from "@/jobs/collection-updates/recalc-token-count-queue-job";
import { nonFlaggedFloorQueueJob } from "@/jobs/collection-updates/non-flagged-floor-queue-job";
import { collectionNormalizedJob } from "@/jobs/collection-updates/collection-normalized-floor-queue-job";
import { collectionFloorJob } from "@/jobs/collection-updates/collection-floor-queue-job";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";

const QUEUE_NAME = "token-updates-fetch-collection-metadata-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 10,
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
      const { contract, tokenId, mintedTimestamp, newCollection, oldCollectionId } =
        job.data as FetchCollectionMetadataInfo;

      try {
        // Fetch collection metadata
        const collection = await MetadataApi.getCollectionMetadata(contract, tokenId, "", {
          allowFallback: !newCollection,
        });

        if (getNetworkSettings().copyrightInfringementContracts.includes(contract.toLowerCase())) {
          collection.name = collection.id;
          collection.metadata = null;

          logger.info(
            QUEUE_NAME,
            JSON.stringify({
              topic: "debugCopyrightInfringementContracts",
              message: "Collection is a copyright infringement",
              contract,
              collection,
            })
          );
        }

        let tokenIdRange: string | null = null;
        if (collection.tokenIdRange) {
          tokenIdRange = `numrange(${collection.tokenIdRange[0]}, ${collection.tokenIdRange[1]}, '[]')`;
        } else if (collection.id === contract) {
          tokenIdRange = `'(,)'::numrange`;
        }

        // For covering the case where the token id range is null
        const tokenIdRangeParam = tokenIdRange ? "$/tokenIdRange:raw/" : "$/tokenIdRange/";

        const queries: PgPromiseQuery[] = [];
        queries.push({
          query: `
            INSERT INTO "collections" (
              "id",
              "slug",
              "name",
              "community",
              "metadata",
              "contract",
              "token_id_range",
              "token_set_id",
              "minted_timestamp"
            ) VALUES (
              $/id/,
              $/slug/,
              $/name/,
              $/community/,
              $/metadata:json/,
              $/contract/,
              ${tokenIdRangeParam},
              $/tokenSetId/,
              $/mintedTimestamp/
            ) ON CONFLICT DO NOTHING;
          `,
          values: {
            id: collection.id,
            slug: collection.slug,
            name: collection.name,
            community: collection.community,
            metadata: collection.metadata,
            contract: toBuffer(collection.contract),
            tokenIdRange,
            tokenSetId: collection.tokenSetId,
            mintedTimestamp: mintedTimestamp ?? null,
          },
        });

        let tokenFilter = `AND "token_id" <@ ${tokenIdRangeParam}`;
        if (newCollection || _.isNull(tokenIdRange)) {
          tokenFilter = `AND "token_id" = $/tokenId/`;
        }

        // Since this is the first time we run into this collection,
        // we update all tokens that match its token definition
        queries.push({
          query: `
                UPDATE "tokens"
                SET "collection_id" = $/collection/,
                    "updated_at" = now()
                WHERE "contract" = $/contract/
                ${tokenFilter}
            `,
          values: {
            contract: toBuffer(collection.contract),
            tokenIdRange,
            tokenId,
            collection: collection.id,
          },
        });

        // Write the collection to the database
        await idb.none(pgp.helpers.concat(queries));

        // Schedule a job to re-count tokens in the collection
        await recalcTokenCountQueueJob.addToQueue({ collection: collection.id });
        await recalcOwnerCountQueueJob.addToQueue([
          { context: QUEUE_NAME, kind: "collectionId", data: { collectionId: collection.id } },
        ]);

        // If token has moved collections, update the old collection's token count
        if (oldCollectionId) {
          await recalcTokenCountQueueJob.addToQueue({ collection: oldCollectionId, force: true });
        }

        // If this is a new collection, recalculate floor price
        if (collection?.id && newCollection) {
          const floorAskInfo = {
            kind: "revalidation",
            contract,
            tokenId,
            txHash: null,
            txTimestamp: null,
          };

          await Promise.all([
            collectionFloorJob.addToQueue([floorAskInfo]),
            nonFlaggedFloorQueueJob.addToQueue([floorAskInfo]),
            collectionNormalizedJob.addToQueue([floorAskInfo]),
          ]);
        }

        if (collection?.id && !config.disableRealtimeMetadataRefresh) {
          await metadataIndexFetchJob.addToQueue(
            [
              {
                kind: "single-token",
                data: {
                  method: metadataIndexFetchJob.getIndexingMethod(collection.community),
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

        // Refresh all royalty specs and the default royalties
        await royalties.refreshAllRoyaltySpecs(
          collection.id,
          collection.royalties as royalties.Royalty[] | undefined,
          collection.openseaRoyalties as royalties.Royalty[] | undefined
        );
        await royalties.refreshDefaultRoyalties(collection.id);

        // Refresh marketplace fees
        await marketplaceFees.updateMarketplaceFeeSpec(
          collection.id,
          "opensea",
          collection.openseaFees as royalties.Royalty[] | undefined
        );
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to fetch collection metadata ${JSON.stringify(job.data)}: ${error}`
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

export type FetchCollectionMetadataInfo = {
  contract: string;
  tokenId: string;
  mintedTimestamp?: number;
  newCollection?: boolean;
  oldCollectionId?: string;
  allowFallbackCollectionMetadata?: boolean;
  context?: string;
};

export const addToQueue = async (infos: FetchCollectionMetadataInfo[], jobId = "") => {
  await queue.addBulk(
    infos.map((info) => {
      if (jobId === "") {
        // For contracts with multiple collections, we have to include the token in order the fetch the right collection
        jobId = getNetworkSettings().multiCollectionContracts.includes(info.contract)
          ? `${info.contract}-${info.tokenId}`
          : info.contract;
      }

      info.allowFallbackCollectionMetadata = info.allowFallbackCollectionMetadata ?? true;

      return {
        name: jobId,
        data: info,
        opts: {
          // Deterministic job id so that we don't perform duplicated work
          jobId,
        },
      };
    })
  );
};
