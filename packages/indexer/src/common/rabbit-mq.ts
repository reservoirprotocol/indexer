/* eslint-disable @typescript-eslint/no-explicit-any */

import amqplib, { ConfirmChannel, Connection } from "amqplib";
import { config } from "@/config/index";
import _ from "lodash";
import { RabbitMqJobsConsumer } from "@/jobs/index";
import { logger } from "@/common/logger";

export type RabbitMQMessage = {
  payload: any;
  jobId?: string;
  publishTime?: number;
  consumedTime?: number;
  completeTime?: number;
  retryCount?: number;
};

export class RabbitMq {
  private static rabbitMqPublisherConnection: Connection;
  private static rabbitMqPublisherChannel: ConfirmChannel;

  public static async connect() {
    RabbitMq.rabbitMqPublisherConnection = await amqplib.connect(config.rabbitMqUrl);
    RabbitMq.rabbitMqPublisherChannel =
      await this.rabbitMqPublisherConnection.createConfirmChannel();
  }

  public static async send(queueName: string, content: RabbitMQMessage, delay = 0, priority = 0) {
    content.publishTime = content.publishTime ?? _.now();

    try {
      await new Promise<void>((resolve, reject) => {
        if (delay) {
          // If delay given publish to the delayed exchange
          RabbitMq.rabbitMqPublisherChannel.publish(
            "delayed",
            queueName,
            Buffer.from(JSON.stringify(content)),
            {
              priority,
              headers: {
                "x-delay": delay,
                "x-deduplication-header": content.jobId,
              },
            },
            (error) => {
              if (!_.isNull(error)) {
                reject(error);
              }

              resolve();
            }
          );
        } else {
          // If no delay send directly to queue to save any unnecessary routing
          RabbitMq.rabbitMqPublisherChannel.sendToQueue(
            queueName,
            Buffer.from(JSON.stringify(content)),
            { priority, headers: { "x-deduplication-header": content.jobId } },
            (error) => {
              if (!_.isNull(error)) {
                reject(error);
              }

              resolve();
            }
          );
        }
      });
    } catch (error) {
      logger.warn(
        "rabbitmq-publish",
        `failed to publish ${JSON.stringify(content)} to ${queueName}`
      );
    }
  }

  public static async sendBatch(
    queueName: string,
    content: RabbitMQMessage[],
    delay = 0,
    priority = 0
  ) {
    await Promise.all(content.map((c) => RabbitMq.send(queueName, c, delay, priority)));
  }

  public static async assertQueuesAndExchanges() {
    // Assert the exchange for delayed messages
    await this.rabbitMqPublisherChannel.assertExchange("delayed", "x-delayed-message", {
      durable: true,
      autoDelete: false,
      arguments: { "x-delayed-type": "direct", "x-message-deduplication": true },
    });

    // Assert the consumer queues
    const consumerQueues = RabbitMqJobsConsumer.getQueues();
    for (const queue of consumerQueues) {
      const options = {
        maxPriority: 1,
        arguments: { "x-message-deduplication": true },
      };

      // Create working queue
      await this.rabbitMqPublisherChannel.assertQueue(queue.getQueue(), options);

      // Create retry queue
      await this.rabbitMqPublisherChannel.assertQueue(queue.getRetryQueue(), options);

      // Bind queues to the delayed exchange
      await this.rabbitMqPublisherChannel.bindQueue(queue.getQueue(), "delayed", queue.getQueue());
      await this.rabbitMqPublisherChannel.bindQueue(
        queue.getRetryQueue(),
        "delayed",
        queue.getRetryQueue()
      );

      // Create dead letter queue for all jobs the failed more than the max retries
      await this.rabbitMqPublisherChannel.assertQueue(queue.getDeadLetterQueue(), {
        arguments: { "x-message-deduplication": true },
        maxLength: queue.getMaxDeadLetterQueue(),
      });
    }
  }
}
