import { AddressZero } from "@ethersproject/constants";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { fromBuffer, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { mintQueueJob } from "@/jobs/token-updates/mint-queue-job";

const QUEUE_NAME = "backfill-tokens-with-missing-collection";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { contract, tokenId } = job.data;

      const results = await idb.manyOrNone(
        `
          SELECT
            tokens.contract,
            tokens.token_id
          FROM tokens
          WHERE tokens.collection_id IS NULL
            AND (tokens.contract, tokens.token_id) > ($/contract/, $/tokenId/)
          ORDER BY tokens.contract, tokens.token_id
          LIMIT 100
        `,
        {
          contract: toBuffer(contract),
          tokenId,
        }
      );

      const currentTime = now();
      await mintQueueJob.addToQueue(
        results.map((r) => ({
          contract: fromBuffer(r.contract),
          tokenId: r.token_id,
          mintedTimestamp: currentTime,
        }))
      );

      if (results.length >= 50) {
        const lastResult = results[results.length - 1];
        await addToQueue(fromBuffer(lastResult.contract), lastResult.token_id);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  if (config.chainId === 1) {
    redlock
      .acquire([`${QUEUE_NAME}-lock-1`], 60 * 60 * 24 * 30 * 1000)
      .then(async () => {
        await addToQueue(AddressZero, "0");
      })
      .catch(() => {
        // Skip on any errors
      });
  }
}

export const addToQueue = async (contract: string, tokenId: string) => {
  await queue.add(randomUUID(), { contract, tokenId }, { jobId: `${contract}-${tokenId}-1` });
};
