/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import _ from "lodash";
import { idb } from "@/common/db";

const QUEUE_NAME = "update-attribute-counts-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 5,
    removeOnFail: 1000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { tokenAttributeCounter } = job.data;

      // Update the attributes token count
      const replacementParams = {};
      let updateCountsString = "";

      _.forEach(tokenAttributeCounter, (count, attributeId) => {
        (replacementParams as any)[`${attributeId}`] = count;
        updateCountsString += `(${attributeId}, $/${attributeId}/),`;
      });

      updateCountsString = _.trimEnd(updateCountsString, ",");

      if (updateCountsString !== "") {
        const updateQuery = `UPDATE attributes
                             SET token_count = token_count + x.countColumn
                             FROM (VALUES ${updateCountsString}) AS x(idColumn, countColumn)
                             WHERE x.idColumn = attributes.id`;

        await idb.none(updateQuery, replacementParams);
      }
    },
    {
      connection: redis.duplicate(),
      concurrency: 2,
    }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (tokenAttributeCounter: object, delay = 0) => {
  await queue.add(QUEUE_NAME, { tokenAttributeCounter }, { delay });
};
