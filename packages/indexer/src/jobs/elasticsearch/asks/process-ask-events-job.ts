import cron from "node-cron";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { redlock } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingAskEventsQueue } from "@/elasticsearch/indexes/asks/pending-ask-events-queue";
import * as AskIndex from "@/elasticsearch/indexes/asks";
import { elasticsearch } from "@/common/elasticsearch";

const BATCH_SIZE = 1000;

export default class ProcessAskEventsJob extends AbstractRabbitMqJobHandler {
  queueName = "process-ask-events-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;

  public async process() {
    const pendingAskEventsQueue = new PendingAskEventsQueue();
    const pendingAskEvents = await pendingAskEventsQueue.get(BATCH_SIZE);

    if (pendingAskEvents.length > 0) {
      try {
        const bulkOps = [];

        for (const pendingAskEvent of pendingAskEvents) {
          if (pendingAskEvent.kind === "index") {
            bulkOps.push({
              index: {
                _index: AskIndex.getIndexName(),
                _id: pendingAskEvent.info.id,
              },
            });
            bulkOps.push(pendingAskEvent.info.document);
          }

          if (pendingAskEvent.kind === "delete") {
            bulkOps.push({
              delete: {
                _index: AskIndex.getIndexName(),
                _id: pendingAskEvent.info.id,
              },
            });
          }
        }

        const response = await elasticsearch.bulk({
          body: bulkOps,
          refresh: true,
        });

        if (config.chainId === 1) {
          const deleteItems = response.items.filter((item) => item.delete);

          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "debugStaleAsks",
              message: "Bulk Response",
              hasErrors: response.errors,
              response: response.errors ? JSON.stringify(response) : undefined,
              deleteItems: JSON.stringify(deleteItems),
            })
          );
        }

        if (response.errors) {
          logger.error(
            this.queueName,
            JSON.stringify({
              topic: "debugStaleAsks",
              message: "Bulk Response Errors",
              bulkOps: JSON.stringify(bulkOps),
              response: JSON.stringify(response),
            })
          );
        }
      } catch (error) {
        logger.error(
          this.queueName,
          JSON.stringify({
            message: `failed to index asks. error=${error}`,
            pendingAskEvents,
            error,
          })
        );

        await pendingAskEventsQueue.add(pendingAskEvents);
      }

      const pendingAskEventsCount = await pendingAskEventsQueue.count();

      if (pendingAskEventsCount > 0) {
        await processAskEventsJob.addToQueue();
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
  return `${processAskEventsJob.queueName}-lock`;
};

export const processAskEventsJob = new ProcessAskEventsJob();

if (config.doBackgroundWork && config.doElasticsearchWork) {
  cron.schedule(
    "*/1 * * * * *",
    async () =>
      await redlock
        .acquire([`${processAskEventsJob.queueName}-queue-lock`], 1000 - 5)
        .then(async () => processAskEventsJob.addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
