import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Attributes } from "@/models/attributes";

export type HandleNewBuyOrderJobPayload = {
  attributeId: number;
  topBuyValue: number | null;
};

export default class HandleNewBuyOrderJob extends AbstractRabbitMqJobHandler {
  queueName = "handle-new-buy-order-queue";
  maxRetries = 10;
  concurrency = 3;

  protected async process(payload: HandleNewBuyOrderJobPayload) {
    const { attributeId, topBuyValue } = payload;

    await Attributes.update(attributeId, {
      topBuyValue,
      buyUpdatedAt: new Date().toISOString(),
    });
  }

  public async addToQueue(params: HandleNewBuyOrderJobPayload) {
    await this.send({ payload: params });
  }
}

export const handleNewBuyOrderJob = new HandleNewBuyOrderJob();
