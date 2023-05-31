import { logger } from "@/common/logger";
import { Channel } from "@/pubsub/channels";
import _ from "lodash";
import { RabbitMqJobsConsumer } from "@/jobs/index";
import { PausedRabbitMqQueues } from "@/models/paused-rabbit-mq-queues";

export class PauseRabbitConsumerQueueEvent {
  public static async handleEvent(message: string) {
    const parsedMessage = JSON.parse(message);
    const queueName = parsedMessage.queueName;

    const job = _.find(RabbitMqJobsConsumer.getQueues(), (queue) => queue.getQueue() === queueName);
    if (job) {
      await RabbitMqJobsConsumer.unsubscribe(job);
      await PausedRabbitMqQueues.add(queueName);
    }

    logger.info(
      Channel.PauseRabbitConsumerQueue,
      `Paused rabbit consumer queue message=${message}`
    );
  }
}
