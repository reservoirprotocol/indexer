import { Event, addEvents } from "@/events-sync/storage/nft-transfer-events";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

export type DeadEventsSyncJobPayload = {
  deadTransferEvents: Event[];
};

export class DeadEventsSyncJob extends AbstractRabbitMqJobHandler {
  queueName = "dead-events-sync";
  maxRetries = 30;
  concurrency = 1;
  consumerTimeout = 10 * 60 * 1000;
  backoff = {
    type: "fixed",
    delay: 1000,
  } as BackoffStrategy;

  protected async process(payload: DeadEventsSyncJobPayload) {
    const { deadTransferEvents } = payload;
    await addEvents(deadTransferEvents, false, true);
  }

  public async addToQueue(params: DeadEventsSyncJobPayload, delay = 0) {
    await this.send({ payload: params }, delay);
  }
}

export const deadEventsSyncJob = new DeadEventsSyncJob();
