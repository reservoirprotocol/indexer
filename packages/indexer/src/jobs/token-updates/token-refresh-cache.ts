import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { inject } from "@/api/index";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { now } from "@/common/utils";
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
      const { contract, tokenId, skipTopBidSimulation } = job.data;

      if (contract === "0x4923917e9e288b95405e2c893d0ac46b895dda22") {
        return;
      }

      // Refresh the token floor sell and top bid
      await Tokens.recalculateTokenFloorSell(contract, tokenId);
      await Tokens.recalculateTokenTopBid(contract, tokenId);

      // Simulate the floor ask and the top bid on the token
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

      if (!skipTopBidSimulation) {
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
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  contract: string,
  tokenId: string,
  skipTopBidSimulation?: boolean
) =>
  queue.add(
    randomUUID(),
    { contract, tokenId, skipTopBidSimulation },
    {
      // No more than one job per token per second
      jobId: `${contract}:${tokenId}:${now()}`,
    }
  );
