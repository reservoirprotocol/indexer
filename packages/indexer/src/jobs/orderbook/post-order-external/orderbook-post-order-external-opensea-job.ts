import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PostOrderExternalParams, processOrder } from "@/jobs/orderbook/post-order-external/utils";

export default class OrderbookPostOrderExternalOpenseaJob extends AbstractRabbitMqJobHandler {
  queueName = "orderbook-post-order-external-opensea-queue";
  maxRetries = 5;
  concurrency = 5;
  lazyMode = true;
  timeout = 60000;

  public async process(payload: PostOrderExternalParams) {
    await processOrder(this, payload);
  }

  public async addToQueue(
    postOrderExternalParams: PostOrderExternalParams,
    delay = 0,
    prioritized = false
  ) {
    await this.send({ payload: postOrderExternalParams }, delay, prioritized ? 1 : 0);
  }
}

export const orderbookPostOrderExternalOpenseaJob = new OrderbookPostOrderExternalOpenseaJob();
