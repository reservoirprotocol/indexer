import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { GenericOrderInfo, processOrder } from "@/jobs/orderbook/utils";

export class OpenseaListingsJob extends AbstractRabbitMqJobHandler {
  queueName = "orderbook-opensea-listings-queue";
  maxRetries = 5;
  concurrency = 75;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;
  disableErrorLogs = true;

  public async process(payload: GenericOrderInfo) {
    await processOrder(this, payload);
  }

  public async addToQueue(orderInfos: GenericOrderInfo[], delay = 0) {
    await this.sendBatch(
      orderInfos.map((orderInfo) => ({
        payload: orderInfo,
        delay: delay ? delay * 1000 : 0,
      }))
    );
  }
}

export const openseaListingsJob = new OpenseaListingsJob();
