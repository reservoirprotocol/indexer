import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { PgPromiseQuery, idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { network } from "@/common/provider";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";

const QUEUE_NAME = "token-updates-mint-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
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
      const { contract, tokenId } = job.data as MintInfo;

      try {
        // TODO: For newly minted tokens we should also populate
        // various cached information (eg. floor sell, top buy),
        // otherwise the tokens might be missing from the result
        // of various APIs which depend on these cached values.

        // First, check the database for any matching collection.
        const collection: {
          id: string;
          index_metadata: boolean | null;
        } | null = await idb.oneOrNone(
          `
            SELECT
              "c"."id",
              "c"."index_metadata"
            FROM "collections" "c"
            WHERE "c"."contract" = $/contract/
              AND "c"."token_id_range" @> $/tokenId/::NUMERIC(78, 0)
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );

        const queries: PgPromiseQuery[] = [];
        if (collection) {
          // If the collection is readily available in the database then
          // all we needed to do is to associate it with the token. As a
          // safety measure, we also associate all the other tokens that
          // match it and have no collection yet.
          queries.push({
            query: `
              WITH "x" AS (
                SELECT
                  "c"."contract",
                  "c"."token_id_range"
                FROM "collections" "c"
                WHERE "c"."id" = $/collection/
              ),
              "y" AS (
                UPDATE "tokens" AS "t" SET
                  "collection_id" = $/collection/,
                  "updated_at" = now()
                FROM "x"
                WHERE "t"."contract" = "x"."contract"
                  AND "t"."token_id" <@ "x"."token_id_range"
                  AND "t"."collection_id" IS NULL
                RETURNING 1
              )
              UPDATE "collections" SET
                "token_count" = "token_count" + (SELECT COUNT(*) FROM "y")
              WHERE "id" = $/collection/
            `,
            values: {
              contract: toBuffer(contract),
              tokenId,
              collection: collection.id,
            },
          });

          // We also need to include the new token to any collection-wide token set.
          queries.push({
            query: `
              WITH "x" AS (
                SELECT DISTINCT
                  "ts"."id"
                FROM "token_sets" "ts"
                WHERE "ts"."collection_id" = $/collection/
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
              collection: collection.id,
            },
          });

          if (collection.index_metadata) {
            await metadataIndexFetch.addToQueue([
              {
                kind: "single-token",
                data: {
                  method: "rarible",
                  contract,
                  tokenId,
                  collection: collection.id,
                },
              },
            ]);
          }
        } else {
          // Otherwise, we fetch the collection metadata from upstream.
          const url = `${config.metadataApiBaseUrl}/v3/${network}/collection?contract=${contract}&tokenId=${tokenId}`;

          const { data } = await axios.get(url);
          const collection: {
            id: string;
            slug: string;
            name: string;
            community: string | null;
            metadata: object | null;
            royalties: object | null;
            contract: string;
            tokenIdRange: [string, string] | null;
            tokenSetId: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } = (data as any).collection;

          const tokenIdRange = collection.tokenIdRange
            ? `numrange(${collection.tokenIdRange[0]}, ${collection.tokenIdRange[1]}, '[]')`
            : `'(,)'::numrange`;
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
                "token_set_id"
              ) VALUES (
                $/id/,
                $/slug/,
                $/name/,
                $/community/,
                $/metadata:json/,
                $/royalties:json/,
                $/contract/,
                $/tokenIdRange:raw/,
                $/tokenSetId/
              ) ON CONFLICT DO NOTHING
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
            },
          });

          // Since this is the first time we run into this collection,
          // we update all tokens that match its token definition.
          queries.push({
            query: `
              WITH "x" AS (
                UPDATE "tokens" SET "collection_id" = $/collection/
                WHERE "contract" = $/contract/
                  AND "token_id" <@ $/tokenIdRange:raw/
                RETURNING 1
              )
              UPDATE "collections" SET
                "token_count" = (SELECT COUNT(*) FROM "x")
              WHERE "id" = $/collection/
            `,
            values: {
              contract: toBuffer(collection.contract),
              tokenIdRange,
              collection: collection.id,
            },
          });
        }

        if (queries.length) {
          await idb.none(pgp.helpers.concat(queries));
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to process mint info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type MintInfo = {
  contract: string;
  tokenId: string;
};

export const addToQueue = async (mintInfos: MintInfo[]) => {
  await queue.addBulk(
    mintInfos.map((mintInfo) => ({
      name: `${mintInfo.contract}-${mintInfo.tokenId}`,
      data: mintInfo,
    }))
  );
};
