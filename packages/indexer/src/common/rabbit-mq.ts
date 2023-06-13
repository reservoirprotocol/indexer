/* eslint-disable @typescript-eslint/no-explicit-any */

import amqplib, { ConfirmChannel, Connection } from "amqplib";
import { config } from "@/config/index";
import _ from "lodash";
import { RabbitMqJobsConsumer } from "@/jobs/index";
import { logger } from "@/common/logger";
import { getNetworkName } from "@/config/network";
import { acquireLock } from "@/common/redis";
import axios from "axios";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import pLimit from "p-limit";

export type RabbitMQMessage = {
  payload: any;
  delay?: number;
  jobId?: string;
  publishTime?: number;
  consumedTime?: number;
  completeTime?: number;
  retryCount?: number;
  persistent?: boolean;
};

export type CreatePolicyPayload = {
  applyTo: "all" | "queues" | "exchanges" | "classic_queues" | "quorum_queues" | "streams";
  name: string;
  pattern: string;
  priority: number;
  vhost?: string;
  definition: {
    "max-length"?: number;
    "max-length-bytes"?: number;
    expires?: number;
    "message-ttl"?: number;
    "alternate-exchange"?: string;
    "queue-mode"?: "default" | "lazy";
  };
};

export type DeletePolicyPayload = {
  name: string;
  vhost?: string;
};

export class RabbitMq {
  public static delayedExchangeName = `${getNetworkName()}.delayed`;

  private static rabbitMqPublisherConnection: Connection;

  private static maxPublisherChannelsCount = 10;
  private static rabbitMqPublisherChannels: ConfirmChannel[] = [];

  public static async connect() {
    RabbitMq.rabbitMqPublisherConnection = await amqplib.connect(config.rabbitMqUrl);

    for (let i = 0; i < RabbitMq.maxPublisherChannelsCount; ++i) {
      RabbitMq.rabbitMqPublisherChannels.push(
        await this.rabbitMqPublisherConnection.createConfirmChannel()
      );
    }
  }

  public static async send(queueName: string, content: RabbitMQMessage, delay = 0, priority = 0) {
    content.publishTime = content.publishTime ?? _.now();

    try {
      // For deduplication messages with delay use redis lock
      if (delay && content.jobId && !(await acquireLock(content.jobId, Number(delay / 1000)))) {
        return;
      }

      const channelIndex = _.random(0, RabbitMq.maxPublisherChannelsCount - 1);

      await new Promise<void>((resolve, reject) => {
        if (delay) {
          content.delay = delay;

          // If delay given publish to the delayed exchange
          RabbitMq.rabbitMqPublisherChannels[channelIndex].publish(
            RabbitMq.delayedExchangeName,
            queueName,
            Buffer.from(JSON.stringify(content)),
            {
              priority,
              persistent: content.persistent,
              headers: {
                "x-delay": delay,
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
          RabbitMq.rabbitMqPublisherChannels[channelIndex].sendToQueue(
            queueName,
            Buffer.from(JSON.stringify(content)),
            {
              priority,
              headers: { "x-deduplication-header": content.jobId },
              persistent: content.persistent,
            },
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
      logger.debug(
        `rabbitmq-publish-${queueName}`,
        `failed to publish ${error} content=${JSON.stringify(content)}`
      );
    }
  }

  public static async sendBatch(
    queueName: string,
    messages: {
      content: RabbitMQMessage;
      delay?: number;
      priority?: number;
    }[]
  ) {
    const limit = pLimit(50);
    await Promise.all(
      messages.map((message) =>
        limit(() => {
          message.delay = message.delay ?? 0;
          message.priority = message.priority ?? 0;
          return RabbitMq.send(queueName, message.content, message.delay, message.priority);
        })
      )
    );
  }

  public static async createOrUpdatePolicy(policy: CreatePolicyPayload) {
    policy.vhost = policy.vhost ?? "/";
    const url = `${config.rabbitHttpUrl}/api/policies/%2F/${policy.name}`;

    await axios.put(url, {
      "apply-to": policy.applyTo,
      definition: policy.definition,
      name: policy.name,
      pattern: policy.pattern,
      priority: policy.priority,
      vhost: policy.vhost,
    });
  }

  public static async deletePolicy(policy: DeletePolicyPayload) {
    policy.vhost = policy.vhost ?? "/";
    const url = `${config.rabbitHttpUrl}/api/policies/%2F/${policy.name}`;

    await axios.delete(url, {
      data: {
        component: "policy",
        name: policy.name,
        vhost: policy.vhost,
      },
    });
  }

  public static async assertQueuesAndExchanges() {
    // Assert the exchange for delayed messages
    await this.rabbitMqPublisherChannels[0].assertExchange(
      RabbitMq.delayedExchangeName,
      "x-delayed-message",
      {
        durable: true,
        autoDelete: false,
        arguments: { "x-delayed-type": "direct" },
      }
    );

    // Assert the consumer queues
    const consumerQueues = RabbitMqJobsConsumer.getQueues();
    for (const queue of consumerQueues) {
      const options = {
        maxPriority: queue.getQueueType() === "classic" ? 1 : undefined,
        arguments: {
          "x-message-deduplication": true,
          "x-single-active-consumer": queue.getSingleActiveConsumer(),
          "x-queue-type": queue.getQueueType(),
        },
      };

      // Create working queue
      await this.rabbitMqPublisherChannels[0].assertQueue(queue.getQueue(), options);

      // Create retry queue
      await this.rabbitMqPublisherChannels[0].assertQueue(queue.getRetryQueue(), options);

      // Bind queues to the delayed exchange
      await this.rabbitMqPublisherChannels[0].bindQueue(
        queue.getQueue(),
        RabbitMq.delayedExchangeName,
        queue.getQueue()
      );

      await this.rabbitMqPublisherChannels[0].bindQueue(
        queue.getRetryQueue(),
        RabbitMq.delayedExchangeName,
        queue.getRetryQueue()
      );

      // Create dead letter queue for all jobs the failed more than the max retries
      await this.rabbitMqPublisherChannels[0].assertQueue(queue.getDeadLetterQueue(), {
        arguments: { "x-message-deduplication": true },
      });

      // If the dead letter queue have custom max length
      if (queue.getMaxDeadLetterQueue() !== AbstractRabbitMqJobHandler.defaultMaxDeadLetterQueue) {
        await this.createOrUpdatePolicy({
          name: `${queue.getDeadLetterQueue()}-policy`,
          vhost: "/",
          priority: 10,
          pattern: `^${queue.getDeadLetterQueue()}$`,
          applyTo: "queues",
          definition: {
            "max-length": queue.getMaxDeadLetterQueue(),
          },
        });
      }

      // If the queue defined as lazy ie use only disk for this queue messages
      if (queue.isLazyMode()) {
        await this.createOrUpdatePolicy({
          name: `${queue.getQueue()}-policy`,
          vhost: "/",
          priority: 10,
          pattern: `^${queue.getQueue()}$|^${queue.getRetryQueue()}$`,
          applyTo: "queues",
          definition: {
            "queue-mode": "lazy",
          },
        });
      }
    }

    // Create general rule for all dead letters queues
    await this.createOrUpdatePolicy({
      name: `${getNetworkName()}.dead-letter-queues-policy`,
      vhost: "/",
      priority: 1,
      pattern: `^${getNetworkName()}.+-dead-letter$`,
      applyTo: "queues",
      definition: {
        "max-length": AbstractRabbitMqJobHandler.defaultMaxDeadLetterQueue,
      },
    });
  }
}
