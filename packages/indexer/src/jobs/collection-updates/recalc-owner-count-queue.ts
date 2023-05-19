import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { acquireLock, getLockExpiration, redis } from "@/common/redis";
import { idb } from "@/common/db";
import { Collections } from "@/models/collections";

const QUEUE_NAME = "collection-recalc-owner-count-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
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
      } else {
        collection = await Collections.getById(data.collectionId);
      }

      if (collection) {
        const acquiredCalcLock = await acquireLock(getCalcLockName(collection.id), 60 * 5);

        if (acquiredCalcLock) {
          let query;

          if (collection.tokenIdRange) {
            query = `
                      WITH x as (
                          SELECT 
                            COUNT(
                              DISTINCT(owner)
                            ) AS owner_count 
                          FROM  nft_balances 
                            JOIN collections ON nft_balances.contract = collections.contract 
                            AND nft_balances.token_id <@ collections.token_id_range 
                          WHERE collections.id = $/collectionId/
                            AND nft_balances.amount > 0
                        ) 
                        UPDATE collections 
                        SET 
                          owner_count = x.owner_count, 
                          updated_at = now() 
                        FROM x 
                        WHERE id = $/collectionId/ 
                          AND COALESCE(collections.owner_count, 0) != x.owner_count;

                  `;
          } else {
            query = `
                      WITH x as (
                          SELECT 
                            COUNT(
                              DISTINCT(owner)
                            ) AS owner_count 
                          FROM nft_balances
                            JOIN tokens ON tokens.contract = nft_balances.contract 
                            AND tokens.token_id = nft_balances.token_id 
                          WHERE tokens.collection_id = $/collectionId/
                            AND nft_balances.amount > 0
                        ) 
                        UPDATE collections
                        SET 
                          "owner_count" = x.owner_count, 
                          "updated_at" = now() 
                        FROM x
                        WHERE id = $/collectionId/
                          AND COALESCE(collections.owner_count, 0) != x.owner_count;
                  `;
          }

          await idb.none(query, {
            collectionId: collection.id,
          });

          logger.info(
            QUEUE_NAME,
            JSON.stringify({
              topic: "Updated owner count",
              jobData: job.data,
              collection: collection.id,
            })
          );
        } else {
          const acquiredScheduleLock = await acquireLock(
            getScheduleLockName(collection.id),
            60 * 5
          );

          if (acquiredScheduleLock) {
            const delay = await getLockExpiration(getCalcLockName(collection.id));

            logger.info(
              QUEUE_NAME,
              JSON.stringify({
                topic: "Reschedule job",
                jobData: job.data,
                collection: collection.id,
                delay,
              })
            );

            await addToQueue(
              [
                {
                  context: QUEUE_NAME,
                  kind: "collectionId",
                  data: {
                    collectionId: collection.id,
                  },
                },
              ],
              delay
            );
          }
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 30 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type RecalcCollectionOwnerCountInfo =
  | {
      context?: string;
      kind: "contactAndTokenId";
      data: {
        contract: string;
        tokenId: string;
      };
    }
  | {
      context?: string;
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
  logger.debug(
    QUEUE_NAME,
    JSON.stringify({
      topic: "addToQueue",
      infos: infos,
      delayInSeconds,
    })
  );

  // await queue.addBulk(
  //   infos.map((info) => ({
  //     name: randomUUID(),
  //     data: info,
  //     opts: {
  //       delay: delayInSeconds * 1000,
  //     },
  //   }))
  // );
};
