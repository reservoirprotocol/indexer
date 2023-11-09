import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { processTopBid, topBidPayload } from "@/jobs/token-set-updates/utils";

export default class TopBidSingleTokenQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "token-set-updates-top-bid-single-token-queue";
  maxRetries = 10;
  concurrency = 20;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  public async process(payload: topBidPayload) {
    await processTopBid(payload, this.queueName);
  }

  public async addToQueue(topBidInfos: topBidPayload[]) {
    await this.sendBatch(topBidInfos.map((info) => ({ payload: info })));
  }
}

export const topBidSingleTokenQueueJob = new TopBidSingleTokenQueueJob();
