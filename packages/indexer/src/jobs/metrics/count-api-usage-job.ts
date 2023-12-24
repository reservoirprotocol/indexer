import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { ApiUsageCounter } from "@/models/api-usage-counter";

export type CountApiUsageJobPayload = {
  apiKey: string;
  route: string;
  statusCode: number;
  points: number;
  timestamp: number;
};

export class CountApiUsageJob extends AbstractRabbitMqJobHandler {
  queueName = "count-api-usage-queue";
  maxRetries = 10;
  concurrency = 30;
  lazyMode = true;

  protected async process(payload: CountApiUsageJobPayload) {
    const { apiKey, route, statusCode, points, timestamp } = payload;
    await ApiUsageCounter.count(apiKey, route, statusCode, points, timestamp);
  }

  public async addToQueue(info: CountApiUsageJobPayload) {
    await this.send({ payload: info });
  }
}

export const countApiUsageJob = new CountApiUsageJob();
