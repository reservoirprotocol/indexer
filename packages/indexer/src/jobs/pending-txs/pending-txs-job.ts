import { logger } from "@/common/logger";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import * as pendingTxs from "@/utils/pending-txs";

export default class PendingTxsJob extends AbstractRabbitMqJobHandler {
  queueName = "pending-txs";
  maxRetries = 10;
  concurrency = 20;
  lazyMode = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: pendingTxs.PendingMessage) {
    try {
      logger.info(this.queueName, JSON.stringify(payload));
      const result = await pendingTxs.handlePendingMessage(payload);
      if (result) {
        logger.info(this.queueName, JSON.stringify(result));
      }
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to handle pending tx info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(payloads: pendingTxs.PendingMessage[]) {
    await this.sendBatch(payloads.map((payload) => ({ payload })));
  }
}

export const pendingTxsJob = new PendingTxsJob();
