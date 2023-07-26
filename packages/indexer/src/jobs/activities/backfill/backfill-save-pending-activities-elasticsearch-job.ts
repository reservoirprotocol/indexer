import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { elasticsearch } from "@/common/elasticsearch";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-activities-queue";
import { RabbitMQMessage } from "@/common/rabbit-mq";

const BATCH_SIZE = 1000;

export type BackfillSavePendingActivitiesElasticsearchJobPayload = {
  indexName?: string;
};

export class BackfillSavePendingActivitiesElasticsearchJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-save-pending-activities-elasticsearch";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process(payload: BackfillSavePendingActivitiesElasticsearchJobPayload) {
    let addToQueue = false;

    const pendingActivitiesQueue = new PendingActivitiesQueue(payload.indexName);
    const pendingActivities = await pendingActivitiesQueue.get(BATCH_SIZE);

    if (pendingActivities.length > 0) {
      try {
        const bulkResponse = await elasticsearch.bulk({
          body: pendingActivities.flatMap((activity) => [
            { index: { _index: payload.indexName, _id: activity.id } },
            activity,
          ]),
        });

        logger.info(
          this.queueName,
          JSON.stringify({
            message: `Saved ${pendingActivities.length} activities.`,
            bulkResponse,
            hasErrors: bulkResponse.errors,
          })
        );

        if (bulkResponse.errors) {
          logger.info(
            this.queueName,
            JSON.stringify({
              message: `Errored activities.`,
              bulkResponse,
              errors: bulkResponse.items.filter((item) => item.index?.error),
            })
          );

          await pendingActivitiesQueue.add(pendingActivities);
        }
      } catch (error) {
        logger.error(
          this.queueName,
          `failed to insert into activities. error=${error}, pendingActivities=${JSON.stringify(
            pendingActivities
          )}`
        );

        await pendingActivitiesQueue.add(pendingActivities);
      }

      addToQueue = true;
    }

    return { addToQueue };
  }

  public events() {
    this.once(
      "onCompleted",
      async (message: RabbitMQMessage, processResult: { addToQueue: boolean }) => {
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
export const backfillSavePendingActivitiesElasticsearchJob =
  new BackfillSavePendingActivitiesElasticsearchJob();
