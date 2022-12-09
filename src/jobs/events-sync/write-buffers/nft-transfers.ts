import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { acquireLock, redis, releaseLock } from "@/common/redis";
import { config } from "@/config/index";
import { idb } from "@/common/db";
import { MqJobsDataManager } from "@/models/mq-jobs-data";
import _ from "lodash";

const QUEUE_NAME = "events-sync-nft-transfers-write";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: true,
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
      const { id } = job.data;

      const lockName = getLockName();
      if (await acquireLock(lockName, 45)) {
        job.data.lockName = lockName;
        const { query } = (await MqJobsDataManager.getJobData(id)) || {};

        if (!query) {
          return;
        }

        try {
          await idb.none(query);
        } catch (error) {
          logger.error(
            QUEUE_NAME,
            `Failed flushing nft transfer events to the database: ${query} error=${error}`
          );
          throw error;
        }
      } else {
        await addToQueueByJobDataId(id);
      }
    },
    {
      connection: redis.duplicate(),
      // It's very important to have this queue be single-threaded
      // in order to avoid database write deadlocks (and it can be
      // even better to have it be single-process).
      concurrency: 1,
    }
  );

  worker.on("completed", async (job) => {
    // If lockName was set release the lock
    if (job.data.lockName) {
      const { id } = job.data;
      await MqJobsDataManager.deleteJobData(id);

      await releaseLock(job.data.lockName);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const getLockName = () => {
  return `${QUEUE_NAME}-lock-${_.random(1, 10)}`;
};

export const addToQueue = async (query: string) => {
  const ids = await MqJobsDataManager.addJobData(QUEUE_NAME, { query });
  await Promise.all(_.map(ids, async (id) => await queue.add(id, { id })));
};

export const addToQueueByJobDataId = async (id: string) => {
  await queue.add(id, { id });
};
