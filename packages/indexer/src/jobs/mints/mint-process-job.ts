import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { detectMint } from "@/utils/mints/calldata/detector";
import { logger } from "@/common/logger";

export type MintProcessJobPayload = {
  txHash: string;
};

export class MintProcessJob extends AbstractRabbitMqJobHandler {
  queueName = "mints-process";
  maxRetries = 10;
  concurrency = 30;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process(payload: MintProcessJobPayload) {
    const { txHash } = payload;

    try {
      await detectMint(txHash);
    } catch (error) {
      logger.error(this.queueName, `Failed to process mint ${JSON.stringify(payload)}: ${error}`);
      throw error;
    }
  }

  public async addToQueue(mints: MintProcessJobPayload[]) {
    await this.sendBatch(mints.map((mint) => ({ payload: mint, jobId: mint.txHash })));
  }
}

export const mintProcessJob = new MintProcessJob();
