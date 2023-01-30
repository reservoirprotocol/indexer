import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

const QUEUE_NAME = "update-collection-activity-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: true,
    removeOnFail: 50000,
    backoff: {
      type: "fixed",
      delay: 5000,
    },
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { newCollectionId, oldCollectionId, contract, tokenId } = job.data;
      const limit = 2000;

      // The following will update the given collection activity to the new collection
      const query = `
        WITH x AS (
          SELECT id
          FROM activities
          WHERE contract = $/contract/
          AND token_id = $/tokenId/
          AND collection_id = $/oldCollectionId/
          LIMIT ${limit}
        )
        
        UPDATE activities
        SET collection_id = $/newCollectionId/
        FROM x
        WHERE activities.id = x.id
        RETURNING 1
      `;

      const result = await idb.manyOrNone(query, {
        newCollectionId,
        oldCollectionId,
        contract: toBuffer(contract),
        tokenId,
      });

      logger.info(
        QUEUE_NAME,
        `Updated ${result.length} activities from ${oldCollectionId} to ${newCollectionId}`
      );

      job.data.continueUpdate = result.length > 0;
    },
    { connection: redis.duplicate(), concurrency: 15 }
  );

  worker.on("completed", async (job) => {
    if (job.data.continueUpdate) {
      await addToQueue(
        job.data.newCollectionId,
        job.data.oldCollectionId,
        job.data.contract,
        job.data.tokenId
      );
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  newCollectionId: string,
  oldCollectionId: string,
  contract: string,
  tokenId: string
) => {
  await queue.add(
    `${contract}:${tokenId}`,
    { newCollectionId, oldCollectionId, contract, tokenId },
    { jobId: `${contract}:${tokenId}` }
  );
};
