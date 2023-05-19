import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { MqJobsDataManager } from "@/models/mq-jobs-data";

const QUEUE_NAME = "events-sync-nft-transfers-write";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 5,
    removeOnFail: 20000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && (config.chainId === 137 ? config.doNftTransfersWrite : true)) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { id } = job.data;

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
    },
    {
      connection: redis.duplicate(),
      concurrency: config.chainId === 56 ? 20 : 10,
    }
  );

  worker.on("completed", async (job) => {
    const { id } = job.data;
    await MqJobsDataManager.deleteJobData(id);
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (query: string) => {
  const ids = await MqJobsDataManager.addMultipleJobData(QUEUE_NAME, { query });
  await Promise.all(_.map(ids, async (id) => await queue.add(id, { id })));
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
