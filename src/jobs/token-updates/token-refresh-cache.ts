import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { inject } from "@/api/index";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { Tokens } from "@/models/tokens";

const QUEUE_NAME = "token-refresh-cache";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { contract, tokenId } = job.data;

      // Refresh the token floor sell and top bid
      await Tokens.recalculateTokenFloorSell(contract, tokenId);
      await Tokens.recalculateTokenTopBid(contract, tokenId);

      // Simulate the floor ask and the top bid on the token
      if (config.chainId !== 5) {
        await inject({
          method: "POST",
          url: `/tokens/simulate-floor/v1`,
          headers: {
            "Content-Type": "application/json",
          },
          payload: {
            token: `${contract}:${tokenId}`,
          },
        });
        await inject({
          method: "POST",
          url: `/tokens/simulate-top-bid/v1`,
          headers: {
            "Content-Type": "application/json",
          },
          payload: {
            token: `${contract}:${tokenId}`,
          },
        });
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (contract: string, tokenId: string) =>
  queue.add(randomUUID(), { contract, tokenId }, { jobId: `${contract}:${tokenId}` });
