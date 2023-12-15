import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { ApiKeyManager } from "@/models/api-keys";
import { allChainsSyncRedis } from "@/common/redis";
import { AllChainsChannel } from "@/pubsub/channels";

export type SyncApiKeysJobPayload = {
  apiKey: string;
};

export class SyncApiKeysJob extends AbstractRabbitMqJobHandler {
  queueName = "sync-api-keys";
  maxRetries = 10;
  concurrency = 30;
  lazyMode = true;

  protected async process(payload: SyncApiKeysJobPayload) {
    const { apiKey } = payload;
    const apiKeyValues = await ApiKeyManager.getApiKey(apiKey);

    await allChainsSyncRedis.publish(
      AllChainsChannel.ApiKeyCreated,
      JSON.stringify({ apiKeyValues })
    );
  }

  public async addToQueue(info: SyncApiKeysJobPayload, delay = 0) {
    await this.send({ payload: info }, delay);
  }
}

export const syncApiKeysJob = new SyncApiKeysJob();
