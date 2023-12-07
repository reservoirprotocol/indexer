import { logger } from "@/common/logger";
import { AllChainsChannel } from "@/pubsub/channels";
import _ from "lodash";
import { RabbitMqJobsConsumer } from "@/jobs/index";
import { PausedRabbitMqQueues } from "@/models/paused-rabbit-mq-queues";
import { config } from "@/config/index";

export class PauseRabbitConsumerAllChainsEvent {
  public static async handleEvent(message: string) {
    // This event is relevant only for consumers
    if (!config.doBackgroundWork) {
      return;
    }

    const parsedMessage = JSON.parse(message);
    const queueName = parsedMessage.queueName;

    // Check if the queue is paused
    const pausedQueues = await PausedRabbitMqQueues.getPausedQueues();
    if (_.indexOf(pausedQueues, queueName) !== -1) {
      return;
    }

    const job = _.find(RabbitMqJobsConsumer.getQueues(), (queue) => queue.getQueue() === queueName);
    if (job) {
      if (await RabbitMqJobsConsumer.unsubscribe(job)) {
        await PausedRabbitMqQueues.add(queueName);

        logger.info(
          AllChainsChannel.PauseRabbitConsumerQueue,
          `Paused rabbit consumer queue message=${message}`
        );
      }
    }
  }
}
