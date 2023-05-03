import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Tokens } from "@/models/tokens";
import { AddressZero } from "@ethersproject/constants";

const QUEUE_NAME = "token-reclac-supply";

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

      const totalSupplyQuery = `
        SELECT SUM(amount) AS "supply"
        FROM nft_transfer_events
        WHERE address = $/contract/
        AND token_id = $/tokenId/
        AND nft_transfer_events.from = $/addressZero/
      `;

      const totalSupply = await redb.oneOrNone(totalSupplyQuery, {
        contract: toBuffer(contract),
        tokenId,
        addressZero: toBuffer(AddressZero),
      });

      const totalRemainingSupplyQuery = `
        SELECT COALESCE(SUM(amount), 0) AS "remainingSupply"
        FROM nft_balances
        WHERE contract = $/contract/
        AND token_id = $/tokenId/
        AND owner != $/addressZero/
        AND amount > 0
      `;

      const totalRemainingSupply = await redb.oneOrNone(totalRemainingSupplyQuery, {
        contract: toBuffer(contract),
        tokenId,
        addressZero: toBuffer(AddressZero),
      });

      await Tokens.update(contract, tokenId, {
        supply: totalSupply.supply,
        remainingSupply: totalRemainingSupply.remainingSupply,
      });
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  tokens: { contract: string; tokenId: string }[],
  delay = 60 * 5 * 1000
) =>
  queue.addBulk(
    tokens.map((t) => ({
      name: `${t.contract}:${t.tokenId}`,
      data: { contract: t.contract, tokenId: t.tokenId },
      opts: {
        // No more than one job per token per second
        jobId: `${t.contract}:${t.tokenId}`,
        delay,
      },
    }))
  );
