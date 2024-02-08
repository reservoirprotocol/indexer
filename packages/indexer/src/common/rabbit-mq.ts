/* eslint-disable @typescript-eslint/no-explicit-any */

import amqplib from "amqplib";
import amqplibConnectionManager, {
  AmqpConnectionManager,
  ChannelWrapper,
} from "amqp-connection-manager";
import { config } from "@/config/index";
import _ from "lodash";
import { logger } from "@/common/logger";
import { getNetworkName } from "@/config/network";
import { acquireLock, extendLock } from "@/common/redis";
import axios from "axios";
import pLimit from "p-limit";
import { FailedPublishMessages } from "@/models/failed-publish-messages-list";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export type RabbitMQMessage = {
  payload: any;
  delay?: number;
  jobId?: string;
  publishTime?: number;
  consumedTime?: number;
  completeTime?: number;
  retryCount?: number;
  publishRetryCount?: number;
  persistent?: boolean;
  prioritized?: boolean;
  correlationId?: string;
};

export type CreatePolicyPayload = {
  applyTo: "all" | "queues" | "exchanges" | "classic_queues" | "quorum_queues" | "streams";
  name: string;
  pattern: string;
  priority: number;
  definition: {
    "max-length"?: number;
    "max-length-bytes"?: number;
    expires?: number;
    "message-ttl"?: number;
    "alternate-exchange"?: string;
    "queue-mode"?: "default" | "lazy";
    "consumer-timeout"?: number;
  };
};

export type DeletePolicyPayload = {
  name: string;
};

export class RabbitMq {
  public static delayedExchangeName = `${getNetworkName()}.delayed`;
  private static rabbitMqPublisherConnection: AmqpConnectionManager;

  private static maxPublisherChannelsCount = 10;
  private static rabbitMqPublisherChannels: ChannelWrapper[] = [];

  public static async connect() {
    RabbitMq.rabbitMqPublisherConnection = amqplibConnectionManager.connect(
      {
        hostname: config.rabbitHostname,
        username: config.rabbitUsername,
        password: config.rabbitPassword,
        vhost: getNetworkName(),
      },
      {
        reconnectTimeInSeconds: 5,
        heartbeatIntervalInSeconds: 0,
      }
    );

    for (let index = 0; index < RabbitMq.maxPublisherChannelsCount; ++index) {
      const channel = this.rabbitMqPublisherConnection.createChannel();
      await channel.waitForConnect();
      RabbitMq.rabbitMqPublisherChannels[index] = channel;

      channel.once("error", (error) => {
        logger.error("rabbit-channel", `Publisher channel error ${error}`);
      });

      channel.once("close", async () => {
        logger.warn("rabbit-channel", `Rabbit publisher channel ${index} closed`);
      });
    }

    RabbitMq.rabbitMqPublisherConnection.once("error", (error) => {
      logger.error("rabbit-connection", `Publisher connection error ${error}`);
    });

    RabbitMq.rabbitMqPublisherConnection.once("close", (error) => {
      logger.warn("rabbit-connection", `Publisher connection error ${error}`);
    });
  }

  public static async send(queueName: string, content: RabbitMQMessage, delay = 0, priority = 0) {
    content.publishRetryCount = content.publishRetryCount ?? 0;
    content.correlationId = content.correlationId ?? randomUUID();

    const msgConsumingBuffer = 30 * 60; // Will be released on the job is done
    const lockTime = Number(_.max([_.toInteger(delay / 1000), 0])) + msgConsumingBuffer;

    // For deduplication messages use redis lock, setting lock only if jobId is passed
    try {
      if (content.jobId && lockTime) {
        // Set lock only if it's the first publish attempt
        if (content.publishRetryCount === 0) {
          if (!(await acquireLock(content.jobId, lockTime))) {
            return;
          }
        } else {
          // if this is re-publish just extend the TTL of the lock
          await extendLock(content.jobId, lockTime);
        }
      }
    } catch (error) {
      logger.warn(
        `rabbit-publish-error`,
        JSON.stringify({
          message: `failed to set lock to ${queueName} error ${error} lockTime ${lockTime} content=${JSON.stringify(
            content
          )}`,
          queueName,
        })
      );
    }

    const channelIndex = _.random(0, RabbitMq.maxPublisherChannelsCount - 1);

    content.publishTime = content.publishTime ?? _.now();
    content.prioritized = Boolean(priority);

    try {
      if (delay) {
        content.delay = delay;

        // If delay given publish to the delayed exchange
        await RabbitMq.rabbitMqPublisherChannels[channelIndex].publish(
          RabbitMq.delayedExchangeName,
          queueName,
          Buffer.from(JSON.stringify(content)),
          {
            persistent: content.persistent,
            headers: {
              "x-delay": delay,
            },
          }
        );
      } else {
        // If no delay send directly to queue to save any unnecessary routing
        await RabbitMq.rabbitMqPublisherChannels[channelIndex].sendToQueue(
          queueName,
          Buffer.from(JSON.stringify(content)),
          {
            persistent: content.persistent,
          }
        );
      }

      if (content.publishRetryCount > 0) {
        logger.info(
          `rabbit-message-republish`,
          JSON.stringify({
            message: `successfully republished to ${queueName} content=${JSON.stringify(content)}`,
            queueName,
          })
        );
      }
    } catch (error) {
      if (`${error}`.includes("nacked")) {
        logger.error(
          `rabbit-publish-error`,
          JSON.stringify({
            message: `failed to publish and will be republish to ${queueName} error ${error} lockTime ${lockTime} content=${JSON.stringify(
              content
            )}`,
            queueName,
          })
        );

        ++content.publishRetryCount;
        const failedPublishMessages = new FailedPublishMessages();
        await failedPublishMessages.add([{ queue: queueName, payload: content }]);
      } else {
        logger.error(
          `rabbit-publish-error`,
          JSON.stringify({
            message: `failed to publish to ${queueName} error ${error} lockTime ${lockTime} content=${JSON.stringify(
              content
            )}`,
            queueName,
          })
        );
      }
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
    const url = `${config.rabbitHttpUrl}/api/policies/${getNetworkName()}/${policy.name}`;

    await axios.put(url, {
      "apply-to": policy.applyTo,
      definition: policy.definition,
      name: policy.name,
      pattern: policy.pattern,
      priority: policy.priority,
    });
  }

  public static async createVhost() {
    if (config.assertRabbitVhost) {
      const url = `${config.rabbitHttpUrl}/api/vhosts/${getNetworkName()}`;
      await axios.put(url);
    }
  }

  public static async deletePolicy(policy: DeletePolicyPayload) {
    const url = `${config.rabbitHttpUrl}/api/policies/${getNetworkName()}/${policy.name}`;

    await axios.delete(url, {
      data: {
        component: "policy",
        name: policy.name,
      },
    });
  }

  public static async getQueueSize(queueName: string, vhost = "%2F") {
    const url = `${config.rabbitHttpUrl}/api/queues/${vhost}/${queueName}`;
    const queueData = await axios.get(url);
    return Number(queueData.data.messages);
  }

  public static async assertQueuesAndExchanges() {
    const abstract = await import("@/jobs/abstract-rabbit-mq-job-handler");
    const jobsIndex = await import("@/jobs/index");

    const connection = await amqplib.connect({
      hostname: config.rabbitHostname,
      username: config.rabbitUsername,
      password: config.rabbitPassword,
      vhost: getNetworkName(),
    });

    const channel = await connection.createChannel();

    // Assert the exchange for delayed messages
    await channel.assertExchange(RabbitMq.delayedExchangeName, "x-delayed-message", {
      durable: true,
      autoDelete: false,
      arguments: { "x-delayed-type": "direct" },
    });

    // Assert the consumer queues
    const consumerQueues = jobsIndex.RabbitMqJobsConsumer.getQueues();
    for (const queue of consumerQueues) {
      const options = {
        maxPriority: queue.getQueueType() === "classic" ? 1 : undefined,
        arguments: {
          "x-single-active-consumer": queue.getSingleActiveConsumer(),
          "x-queue-type": queue.getQueueType(),
        },
      };

      // Create working queue
      await channel.assertQueue(queue.getQueue(), options);

      // Bind main working queue to the delayed exchange
      await channel.bindQueue(queue.getQueue(), RabbitMq.delayedExchangeName, queue.getQueue());

      // If the queue support priorities
      if (queue.isPriorityQueue()) {
        await channel.assertQueue(queue.getPriorityQueue(), options);

        // Bind priority queue to the delayed exchange
        await channel.bindQueue(
          queue.getPriorityQueue(),
          RabbitMq.delayedExchangeName,
          queue.getPriorityQueue()
        );
      }

      // Create dead letter queue for all jobs that failed more than the max retries
      await channel.assertQueue(queue.getDeadLetterQueue(), options);

      // If the dead letter queue have custom max length
      if (
        queue.getMaxDeadLetterQueue() !==
        abstract.AbstractRabbitMqJobHandler.defaultMaxDeadLetterQueue
      ) {
        await this.createOrUpdatePolicy({
          name: `${queue.getDeadLetterQueue()}-policy`,
          priority: 10,
          pattern: `^${queue.getDeadLetterQueue()}$`,
          applyTo: "queues",
          definition: {
            "max-length": queue.getMaxDeadLetterQueue(),
          },
        });
      }

      const definition: CreatePolicyPayload["definition"] = {};

      // If the queue defined as lazy ie use only disk for this queue messages
      if (queue.getQueueType() === "classic" && queue.isLazyMode()) {
        definition["queue-mode"] = "lazy";
      }

      // If the queue has specific timeout
      if (queue.getConsumerTimeout()) {
        definition["consumer-timeout"] = queue.getConsumerTimeout();
      }

      if (!_.isEmpty(definition)) {
        await this.createOrUpdatePolicy({
          name: `${queue.getQueue()}-policy`,
          priority: 10,
          pattern: queue.isPriorityQueue()
            ? `^${queue.getQueue()}$|^${queue.getPriorityQueue()}$`
            : `^${queue.getQueue()}$`,
          applyTo: "queues",
          definition,
        });
      }
    }

    // Create general rule for all dead letters queues
    await this.createOrUpdatePolicy({
      name: "dead-letter-queues-policy",
      priority: 1,
      pattern: "dead-letter$",
      applyTo: "queues",
      definition: {
        "max-length": abstract.AbstractRabbitMqJobHandler.defaultMaxDeadLetterQueue,
      },
    });

    await channel.close();
    await connection.close();
  }

  public static async deleteQueues(folderPath: string, doDelete: boolean): Promise<string[]> {
    const abstract = await import("@/jobs/abstract-rabbit-mq-job-handler");
    const jobsIndex = await import("@/jobs/index");

    let queuesToDelete: string[] = [];
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Recursively search subdirectories
        queuesToDelete = _.concat(queuesToDelete, await RabbitMq.deleteQueues(filePath, false));
      } else if (filePath.endsWith(".ts") || filePath.endsWith(".js")) {
        try {
          const module = await import(filePath);
          for (const exportedKey in module) {
            const exportedItem = module[exportedKey];

            if (
              typeof exportedItem === "object" &&
              exportedItem instanceof abstract.AbstractRabbitMqJobHandler
            ) {
              const job = _.find(
                jobsIndex.RabbitMqJobsConsumer.getQueues(),
                (queue) => queue.getQueue() === exportedItem.getQueue()
              );
              if (!job) {
                queuesToDelete.push(exportedItem.getQueue());
                queuesToDelete.push(exportedItem.getDeadLetterQueue());

                if (exportedItem.isPriorityQueue()) {
                  queuesToDelete.push(exportedItem.getPriorityQueue());
                }
              }
            }
          }
        } catch {
          // Ignore errors
        }
      }
    }

    // Do the actual delete only on the original function call
    if (doDelete && !_.isEmpty(queuesToDelete)) {
      const connection = await amqplib.connect({
        hostname: config.rabbitHostname,
        username: config.rabbitUsername,
        password: config.rabbitPassword,
        vhost: getNetworkName(),
      });

      const channel = await connection.createChannel();
      channel.on("error", () => {
        // Ignore errors
      });

      for (const queue of queuesToDelete) {
        await channel.deleteQueue(queue, { ifUnused: true });
      }

      await channel.close();
      await connection.close();
    }

    return queuesToDelete;
  }
}
