import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";
import { idb } from "@/common/db";
import { randomUUID } from "crypto";
import { Collections } from "@/models/collections";

const QUEUE_NAME = "collection-calc-owner-count-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: true,
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
      const { kind, data } = job.data as RecalcCollectionOwnerCountInfo;

      let collection;

      if (kind === "contactAndTokenId") {
        const { contract, tokenId } = data;

        collection = await Collections.getByContractAndTokenId(contract, Number(tokenId));
      }

      if (collection) {
        const acquiredCalcLock = await acquireLock(getCalcLockName(collection.id), 60 * 5);

        if (!acquiredCalcLock) {
          const acquiredScheduleLock = await acquireLock(
            getScheduleLockName(collection.id),
            60 * 5
          );

          if (acquiredScheduleLock) {
            addToQueue(
              [
                {
                  kind: "collectionId",
                  data: {
                    collectionId: collection.id,
                  },
                },
              ],
              60 * 5
            );
          }
        }

        let query;

        if (collection.tokenIdRange) {
          query = `
                      UPDATE "collections"
                      SET "owner_count" = (
                        SELECT
                          COUNT(DISTINCT(owner)) AS owner_count
                        FROM nft_balances
                        WHERE nft_balances.contract = collections.contract
                          AND nft_balances.token_id <@ collections.token_id_range
                        AND amount > 0
                        ),
                          "updated_at" = now()
                      WHERE "id" = $/collectionId/;
                  `;
        } else {
          query = `
                      UPDATE "collections"
                      SET "owner_count" = (
                        SELECT
                          COUNT(DISTINCT(owner)) AS owner_count
                        FROM nft_balances
                        JOIN tokens ON tokens.contract = nft_balances.contract
                        AND tokens.token_id = nft_balances.token_id
                        WHERE tokens.collection_id = collections.id AND nft_balances.amount > 0
                        ),
                          "updated_at" = now()
                      WHERE "id" = $/collectionId/;
                  `;
        }

        await idb.none(query, {
          collectionId: collection.id,
        });

        logger.info(QUEUE_NAME, `Updated owner count for collection ${collection.id}`);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type RecalcCollectionOwnerCountInfo =
  | {
      kind: "contactAndTokenId";
      data: {
        contract: string;
        tokenId: string;
      };
    }
  | {
      kind: "collectionId";
      data: {
        collectionId: string;
      };
    };

export const getCalcLockName = (collectionId: string) => {
  return `${QUEUE_NAME}-calc-lock:${collectionId}`;
};

export const getScheduleLockName = (collectionId: string) => {
  return `${QUEUE_NAME}-schedule-lock:${collectionId}`;
};

export const addToQueue = async (infos: RecalcCollectionOwnerCountInfo[], delayInSeconds = 0) => {
  await queue.addBulk(
    infos.map((info) => ({
      name: randomUUID(),
      data: info,
      opts: {
        delay: delayInSeconds * 1000,
      },
    }))
  );
};
