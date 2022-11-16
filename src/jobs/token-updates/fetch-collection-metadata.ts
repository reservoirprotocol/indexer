/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import _ from "lodash";

import { PgPromiseQuery, idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import * as collectionRecalcFloorAsk from "@/jobs/collection-updates/recalc-floor-queue";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import MetadataApi from "@/utils/metadata-api";
import { refreshRegistryRoyalties } from "@/utils/royalties/registry";

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
      const { contract, tokenId, mintedTimestamp, newCollection } =
        job.data as FetchCollectionMetadataInfo;

      try {
        const collection = await MetadataApi.getCollectionMetadata(contract, tokenId, "", {
          allowFallback: true,
        });

        let tokenIdRange = null;

        if (collection.tokenIdRange) {
          tokenIdRange = `numrange(${collection.tokenIdRange[0]}, ${collection.tokenIdRange[1]}, '[]')`;
        } else if (collection.id === contract) {
          tokenIdRange = `'(,)'::numrange`;
        }

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
                "royalties",
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
                $/royalties:json/,
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
            royalties: collection.royalties,
            contract: toBuffer(collection.contract),
            tokenIdRange,
            tokenSetId: collection.tokenSetId,
            mintedTimestamp,
          },
        });

        // Since this is the first time we run into this collection,
        // we update all tokens that match its token definition
        let tokenFilter = `AND "token_id" <@ ${tokenIdRangeParam}`;

        if (_.isNull(tokenIdRange)) {
          tokenFilter = `AND "token_id" = $/tokenId/`;
        }

        queries.push({
          query: `
              WITH "x" AS (
                UPDATE "tokens" SET 
                  "collection_id" = $/collection/,
                  "updated_at" = now()
                WHERE "contract" = $/contract/
                ${tokenFilter}
                RETURNING 1
              )
              UPDATE "collections" SET
                "token_count" = (SELECT COUNT(*) FROM "x"),
                "updated_at" = now()
              WHERE "id" = $/collection/
            `,
          values: {
            contract: toBuffer(collection.contract),
            tokenIdRange,
            tokenId,
            collection: collection.id,
          },
        });

        await idb.none(pgp.helpers.concat(queries));

        // id this is a new collection recalculate the collection floor price
        if (collection?.id && newCollection) {
          await collectionRecalcFloorAsk.addToQueue(collection.id);
        }

        if (collection?.id && !config.disableRealtimeMetadataRefresh) {
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

        // Refresh the on-chain royalties from the registry
        await refreshRegistryRoyalties(collection.id);
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
  mintedTimestamp: number;
  newCollection?: boolean;
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

      return {
        name: jobId,
        data: info,
        opts: {
          // Deterministic job id so that we don't perform duplicated work
          jobId: jobId,
        },
      };
    })
  );
};
