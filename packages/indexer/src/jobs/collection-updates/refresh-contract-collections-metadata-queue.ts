import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { acquireLock, redis, releaseLock } from "@/common/redis";
import { config } from "@/config/index";
import { redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import {
  collectionMetadataQueueJob,
  CollectionMetadataInfo,
} from "@/jobs/collection-updates/collection-metadata-queue-job";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";

const QUEUE_NAME = "refresh-contract-collections-metadata-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { contract } = job.data;

      if (await acquireLock(getLockName(contract), 60)) {
        const contractCollections = await redb.manyOrNone(
          `
            SELECT
              collections.community,
              t.token_id
            FROM collections
            JOIN LATERAL (
                      SELECT t.token_id
                      FROM tokens t
                      WHERE t.collection_id = collections.id
                      LIMIT 1
                  ) t ON TRUE
            WHERE collections.contract = $/contract/
            LIMIT 1000
        `,
          {
            contract: toBuffer(contract),
          }
        );

        if (contractCollections.length) {
          const infos: CollectionMetadataInfo[] = contractCollections.map((contractCollection) => ({
            contract,
            tokenId: contractCollection.token_id,
            community: contractCollection.community,
          }));

          await collectionMetadataQueueJob.addToQueueBulk(infos, 0, QUEUE_NAME);
        } else {
          const contractToken = await redb.oneOrNone(
            `
            SELECT
              tokens.token_id
            FROM tokens
            WHERE tokens.contract = $/contract/
            LIMIT 1
          `,
            {
              contract: toBuffer(contract),
            }
          );

          if (contractToken) {
            await metadataIndexFetchJob.addToQueue([
              {
                kind: "single-token",
                data: {
                  method: config.metadataIndexingMethod,
                  contract: contract,
                  tokenId: contractToken.token_id,
                  collection: contract,
                },
              },
            ]);
          }
        }

        await releaseLock(getLockName(contract));
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("failed", async (job) => {
    logger.error(QUEUE_NAME, `Worker failed: ${JSON.stringify(job)}`);
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const getLockName = (contract: string) => {
  return `${QUEUE_NAME}:${contract}-lock`;
};

export const addToQueue = async (contract: string) => {
  await queue.add(randomUUID(), { contract });
};
