import { logger } from "@/common/logger";
import { Channel } from "@/pubsub/channels";
import _ from "lodash";
import { RabbitMqJobsConsumer } from "@/jobs/index";
import { PausedRabbitMqQueues } from "@/models/paused-rabbit-mq-queues";
import { config } from "@/config/index";

export class PauseRabbitConsumerEvent {
  public static async handleEvent(message: string) {
    // This event is relevant only for consumers
    if (!config.doBackgroundWork) {
      return;
    }

    const parsedMessage = JSON.parse(message);
    const queueName = parsedMessage.queueName;

    const job = _.find(RabbitMqJobsConsumer.getQueues(), (queue) => queue.getQueue() === queueName);
    if (job) {
      if (await RabbitMqJobsConsumer.unsubscribe(job)) {
        await PausedRabbitMqQueues.add(queueName);
      }
    }

    logger.info(
      Channel.PauseRabbitConsumerQueue,
      `Paused rabbit consumer queue message=${message}`
    );
  }
}
