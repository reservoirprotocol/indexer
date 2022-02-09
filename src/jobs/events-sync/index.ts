import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider, safeWebSocketSubscription } from "@/common/provider";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";
import {
  ContractKind,
  contractKinds,
  getContractInfo,
  sync,
} from "@/events/index";

// For syncing events we have two separate job queues. One is for
// handling backfilling while the other one handles realtime
// syncing. The reason for this is that we don't want any ongoing
// backfilling processes to delay the realtime syncing (which tries
// to catch up to the head of the blockchain).

// Backfill

const BACKFILL_JOB_NAME = "events_sync_backfill";

export const backfillQueue = new Queue(BACKFILL_JOB_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    // TODO: Introduce jitter to retries
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: true,
  },
});
new QueueScheduler(BACKFILL_JOB_NAME, { connection: redis.duplicate() });

type BackfillingOptions = {
  blocksPerBatch?: number;
  prioritized?: boolean;
  handleAsCatchup?: boolean;
};

export const addToEventsSyncBackfillQueue = async (
  contractKind: ContractKind,
  contracts: string[],
  fromBlock: number,
  toBlock: number,
  options?: BackfillingOptions
) => {
  // Syncing is done in batches since the requested block range
  // might include lots of events that cannot fit within a single
  // provider response
  const blocksPerBatch = options?.blocksPerBatch ?? 512;

  // Important backfilling processes should be prioritized (eg.
  // refetching dropped/orphaned blocks)
  const prioritized = options?.prioritized ?? false;

  const jobs: any[] = [];

  // Sync in reverse in order to handle more recent events first
  for (let to = toBlock; to >= fromBlock; to -= blocksPerBatch) {
    const from = Math.max(fromBlock, to - blocksPerBatch + 1);
    jobs.push({
      name: contractKind,
      data: {
        contractKind,
        contracts,
        fromBlock: from,
        toBlock: to,
        handleAsCatchup: options?.handleAsCatchup,
      },
      opts: {
        priority: prioritized ? 1 : undefined,
      },
    });
  }

  await backfillQueue.addBulk(jobs);
};

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  const worker = new Worker(
    BACKFILL_JOB_NAME,
    async (job: Job) => {
      const { contractKind, contracts, fromBlock, toBlock, handleAsCatchup } =
        job.data;

      try {
        const eventInfo = getContractInfo(contractKind, contracts);
        if (contracts.length) {
          logger.info(
            contractKind,
            `Events backfill syncing block range [${fromBlock}, ${toBlock}]`
          );

          await sync(fromBlock, toBlock, eventInfo, !handleAsCatchup);
        }
      } catch (error) {
        logger.error(contractKind, `Events backfill job failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 2 }
  );
  worker.on("error", (error) => {
    logger.error(BACKFILL_JOB_NAME, `Worker errored: ${error}`);
  });
}

// Catchup

const CATCHUP_JOB_NAME = "events_sync_catchup";

export const catchupQueue = new Queue(CATCHUP_JOB_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    // No retries here, we should be as lean as possible and
    // retrying will be implicitly done on subsequent jobs
    removeOnComplete: true,
    removeOnFail: true,
  },
});
new QueueScheduler(CATCHUP_JOB_NAME, { connection: redis.duplicate() });

export const addToEventsSyncCatchupQueue = async (
  contractKind: ContractKind,
  block?: number
) => {
  await catchupQueue.add(contractKind, { contractKind, block });
};

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  const worker = new Worker(
    CATCHUP_JOB_NAME,
    async (job: Job) => {
      const { contractKind, block } = job.data;

      try {
        // Sync all contracts of the given contract type
        const contracts: string[] = await db
          .manyOrNone(
            `
              select
                "c"."address"
              from "contracts" "c"
              where "c"."kind" = $/contractKind/
            `,
            { contractKind }
          )
          .then((result) => result.map(({ address }) => address));
        const contractInfo = getContractInfo(contractKind, contracts);

        // Support single-block syncing (eg. for the ws block subscription)
        if (block) {
          if (contracts.length) {
            logger.info(contractKind, `Events catchup syncing block ${block}`);
            await sync(block, block, contractInfo);
          }
          return;
        }

        // We allow syncing of up to `maxBlocks` blocks behind the
        // head of the blockchain. If the indexer lagged behind more
        // than that, then all blocks before that will be sent to the
        // backfill queue.
        const maxBlocks = 256;

        const headBlock = await baseProvider.getBlockNumber();

        // Fetch the last synced blocked for the current contract type (if it exists)
        let localBlock = Number(
          await redis.get(`${contractKind}_last_synced_block`)
        );
        if (localBlock >= headBlock) {
          // Nothing to sync
          return;
        }

        if (!localBlock) {
          localBlock = headBlock;
        } else {
          localBlock++;
        }

        const fromBlock = Math.max(localBlock, headBlock - maxBlocks + 1);
        if (contracts.length) {
          logger.info(
            contractKind,
            `Events catchup syncing block range [${fromBlock}, ${headBlock}]`
          );

          await sync(fromBlock, headBlock, contractInfo);

          // Queue any remaining blocks for backfilling
          if (localBlock < fromBlock) {
            await addToEventsSyncBackfillQueue(
              contractKind,
              contracts,
              localBlock,
              fromBlock - 1
            );
          }

          // To avoid missing any events, save the latest synced block with a delay.
          // This will ensure that the latest blocks will get queried more than once,
          // which is exactly what we need (since events for the latest blocks might
          // be missing due to upstream chain reorgs):
          // https://ethereum.stackexchange.com/questions/109660/eth-getlogs-and-some-missing-logs
          await redis.set(`${contractKind}_last_synced_block`, headBlock - 5);
        }
      } catch (error) {
        logger.error(contractKind, `Events catchup failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 3 }
  );
  worker.on("error", (error) => {
    logger.error(CATCHUP_JOB_NAME, `Worker errored: ${error}`);
  });
}

// Every new block (approximately 15 seconds) there might be processes
// we want to run in order to stay up-to-date with the blockchain's
// current state. These processes are all to be triggered from this
// cron job.

// Actual work is to be handled by background worker processes
if (config.doBackgroundWork) {
  cron.schedule("*/15 * * * * *", async () => {
    const lockAcquired = await acquireLock("events_catchup_lock", 10);
    if (lockAcquired) {
      logger.info("events_catchup_cron", "Catching up events");

      try {
        // Sync events
        for (const contractKind of contractKinds) {
          await addToEventsSyncCatchupQueue(contractKind);
        }
      } catch (error) {
        logger.error(
          "events_catchup_cron",
          `Failed to catch up events: ${error}`
        );
      }
    }
  });
}

// ONLY MASTER
if (config.master) {
  // Besides the manual polling of events via the above cron job
  // we're also integrating WebSocket subscriptions to fetch the
  // latest events as soon as they're hapenning on-chain. We are
  // still keeping the manual polling though to ensure no events
  // are being missed.
  safeWebSocketSubscription(async (provider) => {
    provider.on("block", async (block) => {
      for (const contractKind of contractKinds) {
        await addToEventsSyncCatchupQueue(contractKind, block);
      }
    });
  });
}
