import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { allChainsSyncRedis } from "@/common/redis";
import { AllChainsChannel } from "@/pubsub/channels";
import { redb } from "@/common/db";

export type SyncApiKeysJobPayload = {
  apiKey: string;
};

export class SyncApiKeysJob extends AbstractRabbitMqJobHandler {
  queueName = "sync-api-keys";
  maxRetries = 10;
  concurrency = 30;
  lazyMode = true;
  disableConsuming = false;

  protected async process(payload: SyncApiKeysJobPayload) {
    const { apiKey } = payload;

    const apiKeyValues = await redb.oneOrNone(`SELECT * FROM api_keys WHERE key = $/apiKey/`, {
      apiKey,
    });

    if (apiKeyValues) {
      await allChainsSyncRedis.publish(
        AllChainsChannel.ApiKeyCreated,
        JSON.stringify({ values: apiKeyValues })
      );
    }
  }

  public async addToQueue(info: SyncApiKeysJobPayload, delay = 0) {
    await this.send({ payload: info }, delay);
  }
}

export const syncApiKeysJob = new SyncApiKeysJob();
