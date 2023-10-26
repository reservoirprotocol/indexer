import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { refreshMintsForCollection } from "@/orderbook/mints/calldata";

export type MintsRefreshJobPayload = {
  collection: string;
};

export default class MintsRefreshJob extends AbstractRabbitMqJobHandler {
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

    const lockKey = `mints-refresh:${collection}`;
    if (!(await redis.get(lockKey))) {
      logger.info(this.queueName, `Refreshing mints for collection ${collection}`);
      await refreshMintsForCollection(collection);
      await redis.set(lockKey, "locked", "EX", 30 * 60);
    }
  }

  public async addToQueue(mintInfo: MintsRefreshJobPayload, delay = 0) {
    await this.send({ payload: mintInfo, jobId: mintInfo.collection }, delay * 1000);
  }
}

export const mintsRefreshJob = new MintsRefreshJob();
