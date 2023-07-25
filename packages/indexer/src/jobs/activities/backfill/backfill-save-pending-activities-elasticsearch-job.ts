import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { elasticsearch } from "@/common/elasticsearch";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-activities-queue";
import { RabbitMQMessage } from "@/common/rabbit-mq";

const BATCH_SIZE = 1000;

export type BackillSavePendingActivitiesElasticsearchJobPayload = {
  indexName?: string;
};

export class BackillSavePendingActivitiesElasticsearchJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-save-pending-activities-elasticsearch";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;
  singleActiveConsumer = true;

  protected async process(payload: BackillSavePendingActivitiesElasticsearchJobPayload) {
    let addToQueue = false;

    const pendingActivitiesQueue = new PendingActivitiesQueue(payload.indexName);
    const pendingActivities = await pendingActivitiesQueue.get(BATCH_SIZE);

    if (pendingActivities.length > 0) {
      try {
        await elasticsearch.bulk({
          body: pendingActivities.flatMap((activity) => [
            { index: { _index: payload.indexName, _id: activity.id } },
            activity,
          ]),
        });
      } catch (error) {
        logger.error(
          this.queueName,
          `failed to insert into activities. error=${error}, pendingActivities=${JSON.stringify(
            pendingActivities
          )}`
        );

        await pendingActivitiesQueue.add(pendingActivities);
      }

      const pendingActivitiesCount = await pendingActivitiesQueue.count();

      if (pendingActivitiesCount > 0) {
        addToQueue = true;
      }
    }

    return { addToQueue };
  }

  public events() {
    this.once(
      "onCompleted",
      async (message: RabbitMQMessage, processResult: { addToQueue: boolean }) => {
        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "onCompleted",
            rabbitMQMessage: message,
            processResult,
          })
        );

        if (processResult.addToQueue) {
          await this.addToQueue(message.payload.indexName);
        }
      }
    );
  }

  public async addToQueue(indexName?: string) {
    if (!config.doElasticsearchWork) {
      return;
    }

    return this.send({ payload: { indexName } });
  }
}
export const backillSavePendingActivitiesElasticsearchJob =
  new BackillSavePendingActivitiesElasticsearchJob();
