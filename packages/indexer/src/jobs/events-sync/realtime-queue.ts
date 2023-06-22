import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { syncEvents } from "@/events-sync/index";
import * as eventsSyncBackfill from "@/jobs/events-sync/backfill-queue";
import tracer from "@/common/tracer";
import _, { now } from "lodash";
import cron from "node-cron";

const QUEUE_NAME = "events-sync-realtime";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    // In order to be as lean as possible, leave retrying
    // any failed processes to be done by subsequent jobs
    removeOnComplete: true,
    removeOnFail: {
      age: 1,
      count: 1,
    },
    timeout: 45000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (
  config.doBackgroundWork &&
  (_.includes([137, 42161, 10], config.chainId) ? config.doProcessRealtime : true)
) {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await tracer.trace("processEvent", { resource: "eventsSyncRealtime" }, async () => {
        try {
          const startTime = now();
          // We allow syncing of up to `maxBlocks` blocks behind the head
          // of the blockchain. If we lag behind more than that, then all
          // previous blocks that we cannot cover here will be relayed to
          // the backfill queue.
          const maxBlocks = getNetworkSettings().realtimeSyncMaxBlockLag;

          // For high volume chains get up to headBlockDelay from RPC head block to avoid skipping missing blocks
          const providerHeadBlock = await baseProvider.getBlockNumber();
          const headBlock = providerHeadBlock - getNetworkSettings().headBlockDelay;

          // Fetch the last synced blocked
          let localBlock = Number(await redis.get(`${QUEUE_NAME}-last-block`));
          if (localBlock >= headBlock) {
            // Nothing to sync
            return;
          }

          if (localBlock === 0) {
            localBlock = headBlock;
          } else {
            localBlock++;
          }

          const fromBlock = Math.max(localBlock, headBlock - maxBlocks + 1);
          await syncEvents(fromBlock, headBlock);

          // Send any missing blocks to the backfill queue
          if (localBlock + getNetworkSettings().lastBlockLatency < fromBlock) {
            logger.info(
              QUEUE_NAME,
              `Out of sync: local block ${localBlock} and upstream block ${fromBlock} (providerHeadBlock ${providerHeadBlock})total missing ${
                fromBlock - localBlock
              }`
            );
            await eventsSyncBackfill.addToQueue(localBlock, fromBlock - 1);
          }

          // To avoid missing any events, save the last synced block with a delay
          // in order to ensure that the latest blocks will get queried more than
          // once, which is exactly what we are looking for (since events for the
          // latest blocks might be missing due to upstream chain reorgs):
          // https://ethereum.stackexchange.com/questions/109660/eth-getlogs-and-some-missing-logs
          await redis.set(
            `${QUEUE_NAME}-last-block`,
            headBlock - getNetworkSettings().lastBlockLatency
          );

          logger.info(
            "sync-events-timing",
            JSON.stringify({
              message: `Events realtime syncing providerHeadBlock ${providerHeadBlock} block range [${fromBlock}, ${headBlock}]`,
              providerHeadBlock,
              headBlock,
              fromBlock,
              totalBlocks: headBlock - fromBlock,
              syncTime: (now() - startTime) / 1000,
            })
          );
        } catch (error) {
          logger.error(QUEUE_NAME, `Events realtime syncing failed: ${error}`);
          throw error;
        }
      });
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  // Monitor the job as bullmq has bugs and job might be stuck and needs to be manually removed
  cron.schedule(`*/${getNetworkSettings().realtimeSyncFrequencySeconds} * * * * *`, async () => {
    const job = await queue.getJob(`${config.chainId}`);

    if (job && (await job.isFailed())) {
      logger.info(QUEUE_NAME, `removing failed job ${job.timestamp} now = ${now()}`);
      await job.remove();
    } else if (job && _.toInteger(job.timestamp) < now() - 45 * 1000) {
      logger.info(QUEUE_NAME, `removing stale job ${job.timestamp} now = ${now()}`);
      await job.remove();
    }
  });
}

export const addToQueue = async () => {
  const jobId = `${config.chainId}`;
  await queue.add(randomUUID(), {}, { jobId });
};
