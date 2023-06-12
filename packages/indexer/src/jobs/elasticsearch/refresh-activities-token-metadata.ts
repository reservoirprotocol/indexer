import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { Tokens } from "@/models/tokens";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { randomUUID } from "crypto";
import _ from "lodash";

const QUEUE_NAME = "refresh-activities-token-metadata-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 1000,
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
      logger.info(QUEUE_NAME, `Worker started. jobData=${JSON.stringify(job.data)}`);

      const { contract, tokenId } = job.data;

      let tokenUpdateData =
        job.data.tokenUpdateData ?? (await Tokens.getByContractAndTokenId(contract, tokenId));

      tokenUpdateData = _.pickBy(tokenUpdateData, (value) => value !== null);

      if (!_.isEmpty(tokenUpdateData)) {
        const keepGoing = await ActivitiesIndex.updateActivitiesTokenMetadata(
          contract,
          tokenId,
          tokenUpdateData
        );

        if (keepGoing) {
          logger.info(
            QUEUE_NAME,
            `KeepGoing. jobData=${JSON.stringify(job.data)}, tokenUpdateData=${JSON.stringify(
              tokenUpdateData
            )}`
          );

          await addToQueue(contract, tokenId, tokenUpdateData);
        }
      } else {
        logger.info(
          QUEUE_NAME,
          `Worker Skipped. jobData=${JSON.stringify(job.data)}, tokenUpdateData=${JSON.stringify(
            tokenUpdateData
          )}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  contract: string,
  tokenId: string,
  tokenUpdateData?: { name: string | null; image?: string | null; media?: string | null }
) => {
  await queue.add(randomUUID(), { contract, tokenId, tokenUpdateData });
};
