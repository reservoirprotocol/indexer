import cron from "node-cron";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { redlock } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingAskEventsQueue } from "@/elasticsearch/indexes/asks/pending-ask-events-queue";
import * as AskIndex from "@/elasticsearch/indexes/asks";
import { elasticsearch } from "@/common/elasticsearch";

const BATCH_SIZE = 500;

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
        logger.info(this.queueName, `Debug. pendingAskEvents=${pendingAskEvents.length}`);

        await elasticsearch.bulk({
          body: pendingAskEvents.flatMap((pendingAskEvent) => [
            {
              [pendingAskEvent.kind]: {
                _index: AskIndex.getIndexName(),
                _id: pendingAskEvent.document.id,
              },
            },
            pendingAskEvent.document,
          ]),
        });
      } catch (error) {
        logger.error(this.queueName, `failed to index asks. error=${error}`);

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
    config.chainId === 1 ? "*/5 * * * * *" : "*/5 * * * * *",
    async () =>
      await redlock
        .acquire(
          [`${processAskEventsJob.queueName}-queue-lock`],
          config.chainId === 1 ? (5 - 1) * 1000 : (5 - 1) * 1000
        )
        .then(async () => processAskEventsJob.addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
