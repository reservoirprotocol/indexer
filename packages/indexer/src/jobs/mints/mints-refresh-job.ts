import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { refreshMintsForCollection } from "@/orderbook/mints/calldata";

export type MintsRefreshJobPayload = {
  collection: string;
};

export class MintsRefreshJob extends AbstractRabbitMqJobHandler {
  queueName = "mints-refresh";
  maxRetries = 1;
  concurrency = 10;
  lazyMode = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: MintsRefreshJobPayload) {
    const { collection } = payload;

    await refreshMintsForCollection(collection);
  }

  public async addToQueue(mintInfo: MintsRefreshJobPayload, delay = 0) {
    await this.send({ payload: mintInfo, jobId: mintInfo.collection }, delay * 1000);
  }
}

export const mintsRefreshJob = new MintsRefreshJob();
