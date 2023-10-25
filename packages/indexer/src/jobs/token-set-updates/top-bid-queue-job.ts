import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { processTopBid, topBidPayload } from "@/jobs/token-set-updates/utils";

export default class TopBidQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "token-set-updates-top-bid-queue";
  maxRetries = 10;
  concurrency = 20;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process(payload: topBidPayload) {
    await processTopBid(payload, this.queueName);
  }

  public async addToQueue(topBidInfos: topBidPayload[]) {
    await this.sendBatch(topBidInfos.map((info) => ({ payload: info })));
  }
}

export const topBidQueueJob = new TopBidQueueJob();
