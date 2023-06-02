import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import { ApiUsageCounter } from "@/models/api-usage-counter";

export type CountApiUsageJobPayload = {
  apiKey: string;
  route: string;
  statusCode: number;
  points: number;
  timestamp: number;
};

export class CountApiUsageJob extends AbstractRabbitMqJobHandler {
  queueName = `count-api-usage-queue-${config.chainId}`;
  maxRetries = 10;
  concurrency = 10;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: CountApiUsageJobPayload) {
    const { apiKey, route, statusCode, points, timestamp } = payload;
    await ApiUsageCounter.count(apiKey, route, statusCode, points, timestamp);
  }

  public async addToQueue(info: CountApiUsageJobPayload) {
    await this.send({ payload: info });
  }
}

export const countApiUsageJob = new CountApiUsageJob();
