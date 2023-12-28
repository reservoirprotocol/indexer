import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import * as syncEventsUtils from "@/events-sync/utils";
import { Transaction } from "ethers";

export type SaveRedisTransactionsJobPayload = {
  block: number;
};

export class SaveRedisTransactionsJob extends AbstractRabbitMqJobHandler {
  queueName = "save-redis-transactions";
  maxRetries = 5;
  concurrency = 1;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "fixed",
    delay: 1000,
  } as BackoffStrategy;

  protected async process(payload: SaveRedisTransactionsJobPayload) {
    // get block data from redis
    const block = await redis.get(`block:${payload.block}`);

    if (!block) {
      logger.info(this.queueName, `Block ${payload.block} not found in redis`);
      return;
    }

    // save block data
    await syncEventsUtils.saveBlockTransactions(JSON.parse(block));

    // delete block data from redis and transactions from redis
    await redis.del(`block:${payload.block}`);
    await Promise.all(
      JSON.parse(block).transactions.map((tx: Transaction) => redis.del(`tx:${tx.hash}`))
    );
  }

  public async addToQueue(params: SaveRedisTransactionsJobPayload, delay = 0) {
    await this.send({ payload: params, jobId: `${params.block}` }, delay);
  }
}

export const saveRedisTransactionsJob = new SaveRedisTransactionsJob();
