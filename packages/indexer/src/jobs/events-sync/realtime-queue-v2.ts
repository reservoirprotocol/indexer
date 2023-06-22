import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { syncEvents } from "@/events-sync/syncEventsV2";
import { baseProvider } from "@/common/provider";

const QUEUE_NAME = "events-sync-realtime-v2";

export let supports_eth_getBlockReceipts = false;
export let supports_eth_getBlockTrace = false;

const checkSupports = async () => {
  // try to call eth_getBlockReceipts
  try {
    await baseProvider.send("eth_getBlockReceipts", ["0x0"]);
    supports_eth_getBlockReceipts = true;
  } catch (error) {
    supports_eth_getBlockReceipts = false;
  }

  // try to call eth_getBlockTrace
  try {
    await baseProvider.send("debug_traceBlockByNumber", ["0x0", { tracer: "callTracer" }]);
    supports_eth_getBlockTrace = true;
  } catch (error) {
    supports_eth_getBlockTrace = false;
  }
};

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    // In order to be as lean as possible, leave retrying
    // any failed processes to be done by subsequent jobs

    attempts: 30,
    backoff: {
      type: "fixed",
      delay: 100,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.enableRealtimeProcessing) {
  checkSupports();
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      try {
        const { block } = job.data as { block: number };
        await syncEvents(block);
      } catch (error) {
        logger.warn(QUEUE_NAME, `Events realtime syncing failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 15 }
  );

  worker.on("error", (error) => {
    logger.warn(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async ({ block }: { block: number }) => {
  await queue.add(randomUUID(), { block });
};
