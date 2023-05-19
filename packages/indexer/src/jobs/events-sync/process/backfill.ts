import { Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { EventsBatch, processEventsBatch } from "@/events-sync/handlers";
import { MqJobsDataManager } from "@/models/mq-jobs-data";
import { randomUUID } from "crypto";
import _ from "lodash";

const QUEUE_NAME = "events-sync-process-backfill";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 5,
    removeOnFail: 10000,
    timeout: 120000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate(), maxStalledCount: 10 });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && (config.chainId === 137 ? config.doProcessBackfilling : true)) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { id } = job.data as { id: string };

      const batch = (await MqJobsDataManager.getJobData(id)) as EventsBatch;
      if (batch) {
        try {
          if (batch.id) {
            await processEventsBatch(batch);
          } else {
            await processEventsBatch({
              id: randomUUID(),
              events: [
                {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  kind: (batch as any).kind,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  data: (batch as any).events,
                },
              ],
              backfill: batch.backfill,
            });
          }
        } catch (error) {
          logger.error(QUEUE_NAME, `Events processing failed: ${error}`);
          throw error;
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 15 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  worker.on("completed", async (job) => {
    const { id } = job.data;
    await MqJobsDataManager.deleteJobData(id);
  });
}

export const addToQueue = async (batches: EventsBatch[]) => {
  const jobs: { name: string; data: { id: string } }[] = [];
  for (const batch of batches) {
    const ids = await MqJobsDataManager.addMultipleJobData(QUEUE_NAME, batch);
    for (const id of ids) {
      jobs.push({ name: `${batch.id}-${id}`, data: { id } });
    }
  }

  await queue.addBulk(jobs);
};

export const addToQueueByJobDataId = async (ids: string | string[]) => {
  if (_.isArray(ids)) {
    const jobs: { name: string; data: { id: string } }[] = [];
    for (const id of ids) {
      jobs.push({ name: id, data: { id } });
    }

    await queue.addBulk(jobs);
  } else {
    await queue.add(ids, { id: ids });
  }
};
