import { logger } from "@/common/logger";
import { AllChainsChannel } from "@/pubsub/channels";
import _ from "lodash";
import { RabbitMqJobsConsumer } from "@/jobs/index";
import { PausedRabbitMqQueues } from "@/models/paused-rabbit-mq-queues";
import { config } from "@/config/index";

export class ResumeRabbitConsumerAllChainsEvent {
  public static async handleEvent(message: string) {
    // This event is relevant only for consumers
    if (!config.doBackgroundWork) {
      return;
    }

    const parsedMessage = JSON.parse(message);
    const queueName = parsedMessage.queueName;

    const job = _.find(RabbitMqJobsConsumer.getQueues(), (queue) => queue.getQueue() === queueName);
    await PausedRabbitMqQueues.delete(queueName);

    if (job) {
      await RabbitMqJobsConsumer.subscribe(job);

      logger.info(
        AllChainsChannel.ResumeRabbitConsumerQueue,
        `Resumed rabbit consumer queue message=${message}`
      );
    }
  }
}
