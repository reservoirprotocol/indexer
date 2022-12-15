import { Queue, QueueScheduler, Worker } from "bullmq";

import _ from "lodash";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { EventsInfo, processEvents } from "@/events-sync/handlers";
import { MqJobsDataManager } from "@/models/mq-jobs-data";

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
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { id } = job.data;
      const info = ((await MqJobsDataManager.getJobData(id)) as EventsInfo) || {};

      if (!info) {
        return;
      }

      try {
        await processEvents(info);
      } catch (error) {
        logger.error(QUEUE_NAME, `Events processing failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 20 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  worker.on("completed", async (job) => {
    const { id } = job.data;
    await MqJobsDataManager.deleteJobData(id);
  });
}

export const addToQueue = async (infos: EventsInfo[]) => {
  const jobs: { name: string; data: { id: string } }[] = [];
  infos = _.filter(infos, (info) => !_.isEmpty(info.events));

  if (!_.isEmpty(infos)) {
    const ids = await MqJobsDataManager.addJobData(QUEUE_NAME, infos);
    _.map(ids, (id) => jobs.push({ name: id, data: { id } }));

    if (!_.isEmpty(jobs)) {
      await queue.addBulk(jobs);
    }
  }
};

export const addToQueueByJobDataId = async (id: string) => {
  await queue.add(id, { id });
};
