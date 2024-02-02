import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

export type RemoveUnsyncedEventsActivitiesJobPayload = {
  blockHash: string;
};

export default class RemoveUnsyncedEventsActivitiesJob extends AbstractRabbitMqJobHandler {
  queueName = "remove-unsynced-events-activities-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  useSharedChannel = true;

  public async process(payload: RemoveUnsyncedEventsActivitiesJobPayload) {
    await ActivitiesIndex.deleteActivitiesByBlockHash(payload.blockHash);

    const keepGoing = await ActivitiesIndex.deleteActivitiesByBlockHash(payload.blockHash);

    if (keepGoing) {
      await this.addToQueue(payload.blockHash);
    }
  }

  public async addToQueue(blockHash: string) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({ payload: { blockHash } });
  }
}

export const removeUnsyncedEventsActivitiesJob = new RemoveUnsyncedEventsActivitiesJob();
