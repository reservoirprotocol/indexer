import cron from "node-cron";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { redlock } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import * as CollectionsIndex from "@/elasticsearch/indexes/collections";
import { elasticsearch } from "@/common/elasticsearch";
import { PendingCollectionEventsQueue } from "@/elasticsearch/indexes/collections/pending-collection-events-queue";

const BATCH_SIZE = 1000;

export default class ProcessCollectionEventsJob extends AbstractRabbitMqJobHandler {
  queueName = "process-collection-events-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;

  public async process() {
    const pendingCollectionEventsQueue = new PendingCollectionEventsQueue();
    const pendingCollectionEvents = await pendingCollectionEventsQueue.get(BATCH_SIZE);

    if (pendingCollectionEvents.length > 0) {
      try {
        const bulkOps = [];

        for (const pendingCollectionEvent of pendingCollectionEvents) {
          if (pendingCollectionEvent.kind === "index") {
            bulkOps.push({
              index: {
                _index: CollectionsIndex.getIndexName(),
                _id: pendingCollectionEvent._id,
              },
            });
            bulkOps.push(pendingCollectionEvent.document);
          }

          if (pendingCollectionEvent.kind === "delete") {
            bulkOps.push({
              delete: {
                _index: CollectionsIndex.getIndexName(),
                _id: pendingCollectionEvent._id,
              },
            });
          }
        }

        const response = await elasticsearch.bulk({
          body: bulkOps,
        });

        if (response.errors) {
          logger.error(
            this.queueName,
            JSON.stringify({
              topic: "debugCollectionsIndex",
              message: `Index errors.`,
              data: {
                bulkOps: JSON.stringify(bulkOps),
              },
              response,
            })
          );
        }
      } catch (error) {
        logger.error(
          this.queueName,
          JSON.stringify({
            topic: "debugCollectionsIndex",
            message: `failed to index collections. error=${error}`,
            pendingCollectionEvents,
            error,
          })
        );

        await pendingCollectionEventsQueue.add(pendingCollectionEvents);
      }

      const pendingCollectionEventsCount = await pendingCollectionEventsQueue.count();

      if (pendingCollectionEventsCount > 0) {
        await processCollectionEventsJob.addToQueue();
      }
    }
  }

  public async addToQueue() {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send();
  }
}

export const getLockName = () => {
  return `${processCollectionEventsJob.queueName}-lock`;
};

export const processCollectionEventsJob = new ProcessCollectionEventsJob();

if (config.doBackgroundWork && config.doElasticsearchWork) {
  cron.schedule(
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire([`${processCollectionEventsJob.queueName}-queue-lock`], 5 * 1000 - 500)
        .then(async () => processCollectionEventsJob.addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
