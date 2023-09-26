import { Queue, QueueScheduler, Worker } from "bullmq";

import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { randomUUID } from "crypto";
import { fromBuffer } from "@/common/utils";
import { idb } from "@/common/db";
import { FillEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/fill-event-created";
import { logger } from "@/common/logger";

const QUEUE_NAME = "backfill-deleted-sales-elasticsearch-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    backoff: {
      type: "fixed",
      delay: 5000,
    },
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.doElasticsearchWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const results = await idb.manyOrNone(
        "select * from fill_events_2 where order_id is null and order_kind = 'blur-v2' and timestamp >= 1688187822"
      );

      if (results.length) {
        const toBeDeletedActivityIds = results.map((result) => {
          const eventHandler = new FillEventCreatedEventHandler(
            fromBuffer(result.tx_hash),
            result.log_index,
            result.batch_index
          );

          const activityId = eventHandler.getActivityId();

          logger.error(
            QUEUE_NAME,
            `Debug: activityId=${activityId} txHash=${fromBuffer(result.tx_hash)} logIndex=${
              result.log_index
            } batchIndex=${result.batch_index}`
          );

          return activityId;
        });

        await ActivitiesIndex.deleteActivitiesById(toBeDeletedActivityIds);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (delay = 1000) => {
  await queue.add(randomUUID(), {}, { delay });
};
