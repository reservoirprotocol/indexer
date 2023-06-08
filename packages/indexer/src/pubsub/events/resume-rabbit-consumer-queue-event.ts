import { logger } from "@/common/logger";
import { Channel } from "@/pubsub/channels";
import _ from "lodash";
import { RabbitMqJobsConsumer } from "@/jobs/index";
import { PausedRabbitMqQueues } from "@/models/paused-rabbit-mq-queues";

export class ResumeRabbitConsumerQueueEvent {
  public static async handleEvent(message: string) {
    const parsedMessage = JSON.parse(message);
    const queueName = parsedMessage.queueName;

    const job = _.find(RabbitMqJobsConsumer.getQueues(), (queue) => queue.getQueue() === queueName);
    if (job) {
      await PausedRabbitMqQueues.delete(queueName);
      await RabbitMqJobsConsumer.subscribe(job);
    }

    logger.info(
      Channel.ResumeRabbitConsumerQueue,
      `Resumed rabbit consumer queue message=${message}`
    );
  }
}
