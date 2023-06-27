import { Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const QUEUE_NAME = "mints-supply-check";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 1,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 0,
    removeOnFail: 1000,
    timeout: 5000,
  },
});
export let worker: Worker | undefined;

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { collection } = job.data;

      let close = false;

      const collectionMint: {
        contract: string;
        maxSupply: string | null;
        tokenId: string | null;
      } | null = await idb
        .oneOrNone(
          `
            SELECT
              collections.contract,
              collection_mints.max_supply,
              collection_mints.token_id
            FROM collection_mints
            JOIN collections
              ON collections.id = collection_mints.collection_id
            WHERE collection_mints.collection_id = $/collection/
          `,
          { collection }
        )
        .then((r) =>
          r
            ? {
                contract: fromBuffer(r.contract),
                maxSupply: r.max_supply,
                tokenId: r.token_id,
              }
            : null
        );
      if (collectionMint?.maxSupply) {
        let tokenCount: string;
        if (collectionMint.tokenId) {
          tokenCount = await idb
            .one(
              `
                SELECT
                  sum(nft_balances.amount) AS token_count
                FROM nft_balances
                WHERE nft_balances.contract = $/contract/
                  AND nft_balances.token_id = $/tokenId/
                  AND nft_balances.amount > 0
              `,
              {
                contract: toBuffer(collectionMint.contract),
                tokenId: collectionMint.tokenId,
              }
            )
            .then((r) => r.token_count);
        } else {
          tokenCount = await idb
            .one(
              `
                SELECT
                  collections.token_count
                FROM collections
                WHERE collections.id = $/collection/
              `,
              { collection }
            )
            .then((r) => r.token_count);
        }

        if (bn(collectionMint.maxSupply).lte(tokenCount)) {
          close = true;
        }
      }

      if (close) {
        await idb.none(
          `
            UPDATE collection_mints SET
              status = 'closed',
              updated_at = now()
            WHERE collection_mints.collection_id = $/collection/
          `,
          { collection }
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (collection: string, delay = 30) =>
  queue.add(QUEUE_NAME, { collection }, { delay: delay * 1000, jobId: collection });
