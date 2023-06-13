import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Activities } from "@/models/activities";
import { UserActivities } from "@/models/user-activities";
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
    await Promise.all([
      Activities.deleteByBlockHash(payload.blockHash),
      UserActivities.deleteByBlockHash(payload.blockHash),
    ]);

    if (config.doElasticsearchWork) {
      await ActivitiesIndex.deleteActivitiesByBlockHash(payload.blockHash);
    }
  }

  public async addToQueue(params: RemoveUnsyncedEventsActivitiesJobPayload) {
    await this.send({ payload: params });
  }
}

export const removeUnsyncedEventsActivitiesJob = new RemoveUnsyncedEventsActivitiesJob();
