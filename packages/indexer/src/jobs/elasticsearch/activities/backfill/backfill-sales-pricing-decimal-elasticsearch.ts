import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { ActivityDocument } from "@/elasticsearch/indexes/activities/base";
import { randomUUID } from "crypto";
import { elasticsearch } from "@/common/elasticsearch";
import { formatEth } from "@/common/utils";

const QUEUE_NAME = "backfill-sales-pricing-decimal-elasticsearch-queue";

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
    async (job: Job) => {
      job.data.addToQueue = false;

      const query = {
        bool: {
          must_not: [
            {
              exists: {
                field: "pricing.priceDecimal",
              },
            },
          ],
          must: [
            {
              exists: {
                field: "pricing.price",
              },
            },
            {
              terms: {
                type: ["sale", "mint"],
              },
            },
          ],
        },
      };

      const esResult = await elasticsearch.search<ActivityDocument>({
        index: ActivitiesIndex.getIndexName(),
        // This is needed due to issue with elasticsearch DSL.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        query,
        size: 1000,
      });

      const activities = esResult.hits.hits.map((hit) => hit._source!);

      if (activities.length) {
        const bulkParams = {
          body: activities.flatMap((activity) => [
            {
              update: {
                _index: ActivitiesIndex.getIndexName(),
                _id: activity.id,
                retry_on_conflict: 5,
              },
            },
            {
              doc: { "pricing.priceDecimal": formatEth(activity.pricing!.price!) },
            },
          ]),
          filter_path: "items.*.error",
        };

        const response = await elasticsearch.bulk(bulkParams, { ignore: [404] });

        if (response?.errors) {
          job.data.addToQueue = response?.items.some((item) => item.update?.status !== 400);

          logger.error(
            QUEUE_NAME,
            JSON.stringify({
              message: `Errors in response`,
              bulkParams,
              response,
              addToQueue: job.data.addToQueue,
            })
          );
        } else {
          job.data.addToQueue = activities.length === 1000;

          logger.info(
            QUEUE_NAME,
            JSON.stringify({
              message: `Success`,
              bulkParams,
              response,
              addToQueue: job.data.addToQueue,
            })
          );
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("completed", async (job) => {
    if (job.data.addToQueue) {
      await addToQueue();
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (delay = 1000) => {
  await queue.add(randomUUID(), {}, { delay });
};
