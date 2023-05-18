import { AddressZero } from "@ethersproject/constants";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { fetchTransaction } from "@/events-sync/utils";
import { getMethodSignature } from "@/utils/method-signatures";

const QUEUE_NAME = "mints-process";

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
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { txHash } = job.data as Mint;

      try {
        // Fetch all transfers associated to the mint transaction
        const transfers = await idb
          .manyOrNone(
            `
              SELECT
                nft_transfer_events.address,
                nft_transfer_events.token_id,
                nft_transfer_events.amount,
                nft_transfer_events.from,
                nft_transfer_events.to
              FROM nft_transfer_events
              WHERE nft_transfer_events.tx_hash = $/txHash/
            `,
            {
              txHash: toBuffer(txHash),
            }
          )
          .then((ts) =>
            ts.map((t) => ({
              contract: fromBuffer(t.address),
              tokenId: t.token_id,
              amount: t.amount,
              from: fromBuffer(t.from),
              to: fromBuffer(t.to),
            }))
          );

        // Return early if no transfers are available
        if (!transfers.length) {
          return;
        }

        // Make sure that every mint in the transaction is associated to the same contract
        if (!transfers.every((t) => t.contract === transfers[0].contract)) {
          return;
        }

        // Make sure that every mint in the transaction goes to the transaction sender
        const tx = await fetchTransaction(txHash);
        if (!transfers.every((t) => t.from === AddressZero && t.to === tx.from)) {
          return;
        }

        const methodSignature = await getMethodSignature(tx.data);
        if (methodSignature) {
          logger.info(
            QUEUE_NAME,
            JSON.stringify({
              txHash: tx,
              data: tx.data,
              signature: JSON.stringify(methodSignature, null, 2),
            })
          );
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Failed to process mint ${JSON.stringify(job.data)}: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 30 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type Mint = {
  txHash: string;
};

export const addToQueue = async (mints: Mint[]) =>
  queue.addBulk(
    mints.map((mint) => ({
      name: mint.txHash,
      data: mint,
      opts: {
        // Deterministic job id so that we don't perform duplicated work
        jobId: mint.txHash,
      },
    }))
  );
