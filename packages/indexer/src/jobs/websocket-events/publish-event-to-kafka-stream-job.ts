import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { KafkaEvent, publishKafkaEvent } from "@/jobs/websocket-events/utils";
import { logger } from "@/common/logger";

export type PublishEventToKafkaStreamJobPayload = {
  event: KafkaEvent;
};

export class PublishEventToKafkaStreamJob extends AbstractRabbitMqJobHandler {
  queueName = "publish-event-to-kafka-stream-queue";
  maxRetries = 5;
  concurrency = 10;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 1000,
  } as BackoffStrategy;

  public async process(payload: PublishEventToKafkaStreamJobPayload) {
    const { event } = payload;

    logger.info(
      this.queueName,
      JSON.stringify({
        topic: "kafka-stream",
        message: `publishKafkaEvent`,
        payload: JSON.stringify(payload),
      })
    );

    await publishKafkaEvent(event);
  }

  public async addToQueue(payloads: PublishEventToKafkaStreamJobPayload[]) {
    if (!config.doKafkaStreamWork) {
      return;
    }

    await this.sendBatch(
      payloads.map((payload) => ({
        payload,
      }))
    );
  }
}

export const publishEventToKafkaStreamJob = new PublishEventToKafkaStreamJob();
