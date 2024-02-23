import { logger } from "@/common/logger";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import * as pendingTxs from "@/utils/pending-txs";

export default class PendingTxsJob extends AbstractRabbitMqJobHandler {
  queueName = "pending-txs";
  maxRetries = 10;
  concurrency = 20;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  public async process(payload: pendingTxs.PendingMessage) {
    try {
      const results = await pendingTxs.handlePendingMessage(payload);
      if (results.length) {
        logger.info(this.queueName, JSON.stringify({ payload, results, hasResults: true }));
      } else {
        logger.info(this.queueName, JSON.stringify({ payload, hasResults: false }));
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
