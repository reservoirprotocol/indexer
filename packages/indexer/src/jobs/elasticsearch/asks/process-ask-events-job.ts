import cron from "node-cron";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { redlock } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingAskEventsQueue } from "@/elasticsearch/indexes/asks/pending-ask-events-queue";
import * as AskIndex from "@/elasticsearch/indexes/asks";
import { elasticsearch } from "@/common/elasticsearch";
import { randomUUID } from "crypto";

const BATCH_SIZE = 1000;

export default class ProcessAskEventsJob extends AbstractRabbitMqJobHandler {
  queueName = "process-ask-events-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process() {
    const pendingAskEventsQueue = new PendingAskEventsQueue();
    const pendingAskEvents = await pendingAskEventsQueue.get(BATCH_SIZE);

    if (pendingAskEvents.length > 0) {
      try {
        const bulkOps = [];

        const correlationId = randomUUID();

        for (const pendingAskEvent of pendingAskEvents) {
          if (config.chainId === 137) {
            logger.info(
              this.queueName,
              JSON.stringify({
                message: `Processing pendingAskEvent. orderId=${pendingAskEvent.info.id}, kind=${pendingAskEvent.kind}, correlationId=${correlationId}`,
                topic: "debugMissingAsks",
                pendingAskEvent,
                correlationId,
              })
            );
          }

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

        if (config.chainId === 137) {
          logger.info(
            this.queueName,
            JSON.stringify({
              message: `indexed asks. correlationId=${correlationId}`,
              topic: "debugMissingAsks",
              data: {
                bulkOps: JSON.stringify(bulkOps),
              },
              response,
              correlationId,
            })
          );
        }

        if (response.errors) {
          logger.error(
            this.queueName,
            JSON.stringify({
              topic: "save-errors",
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
    "*/2 * * * * *",
    async () =>
      await redlock
        .acquire([`${processAskEventsJob.queueName}-queue-lock`], 2 * 1000 - 500)
        .then(async () => processAskEventsJob.addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
