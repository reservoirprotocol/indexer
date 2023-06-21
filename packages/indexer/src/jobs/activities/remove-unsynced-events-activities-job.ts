import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

export type RemoveUnsyncedEventsActivitiesJobPayload = {
  blockHash: string;
};

export class RemoveUnsyncedEventsActivitiesJob extends AbstractRabbitMqJobHandler {
  queueName = "remove-unsynced-events-activities-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;
  useSharedChannel = true;

  protected async process(payload: RemoveUnsyncedEventsActivitiesJobPayload) {
    await ActivitiesIndex.deleteActivitiesByBlockHash(payload.blockHash);
  }

  public async addToQueue(params: RemoveUnsyncedEventsActivitiesJobPayload) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({ payload: params });
  }
}

export const removeUnsyncedEventsActivitiesJob = new RemoveUnsyncedEventsActivitiesJob();
