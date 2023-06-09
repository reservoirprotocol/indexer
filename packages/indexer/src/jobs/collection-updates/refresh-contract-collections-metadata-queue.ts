import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { acquireLock, redis, releaseLock } from "@/common/redis";
import { config } from "@/config/index";
import { redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { Tokens } from "@/models/tokens";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";
import { CollectionMetadataInfo } from "@/jobs/collection-updates/metadata-queue";

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
            collections.id,
            collections.community,
            collections.token_id_range
          FROM collections
          WHERE collections.contract = $/contract/
        `,
          {
            contract: toBuffer(contract),
          }
        );

        if (contractCollections.length) {
          const infos: CollectionMetadataInfo[] = [];

          for (const contractCollection of contractCollections) {
            const tokenId = await Tokens.getSingleToken(contractCollection.id);

            infos.push({
              contract,
              tokenId,
              community: contractCollection.community,
            });
          }

          await collectionUpdatesMetadata.addToQueueBulk(infos, 0, QUEUE_NAME);
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
            await metadataIndexFetch.addToQueue([
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
