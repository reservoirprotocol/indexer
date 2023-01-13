import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
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
    removeOnComplete: 5,
    removeOnFail: 20000,
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
      let { query } = (await MqJobsDataManager.getJobData(id)) || {};

      if (!query) {
        return;
      }

      if (!_.includes(query, "ORDER BY")) {
        query = _.replace(
          query,
          `FROM "x"`,
          `FROM "x" ORDER BY "address" ASC, "token_id" ASC, "owner" ASC`
        );
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
      // It's very important to have this queue be single-threaded
      // in order to avoid database write deadlocks (and it can be
      // even better to have it be single-process).
      concurrency: 5,
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
  const ids = await MqJobsDataManager.addJobData(QUEUE_NAME, { query });
  await Promise.all(_.map(ids, async (id) => await queue.add(id, { id })));
};

export const addToQueueByJobDataId = async (id: string) => {
  await queue.add(id, { id });
};
