/* eslint-disable @typescript-eslint/no-explicit-any */

// Abstract class needed to be implemented in order to process job from rabbit
import { RabbitMq, RabbitMQMessage } from "@/common/rabbit-mq";
import { logger } from "@/common/logger";
import _ from "lodash";
import { ConsumeMessage } from "amqplib";
import { extendLock, releaseLock } from "@/common/redis";
import { ChannelWrapper } from "amqp-connection-manager";
import { config } from "@/config/index";

export type BackoffStrategy =
  | {
      type: "exponential";
      delay: number;
    }
  | {
      type: "fixed";
      delay: number;
    }
  | null;

export type QueueType = "classic" | "quorum";

export abstract class AbstractRabbitMqJobHandler {
  static defaultMaxDeadLetterQueue = 50000;

  abstract queueName: string;
  abstract maxRetries: number;

  protected abstract process(payload: any): Promise<any>;

  protected rabbitMqMessage: RabbitMQMessage | undefined; // Hold the rabbitmq message type with all the extra fields
  protected concurrency = 1;
  protected maxDeadLetterQueue = AbstractRabbitMqJobHandler.defaultMaxDeadLetterQueue;
  protected backoff: BackoffStrategy = null;
  protected singleActiveConsumer: boolean | undefined;
  protected persistent = true;
  protected useSharedChannel = false;
  protected lazyMode = false;
  protected queueType: QueueType = "classic";
  protected timeout = 0; // Job timeout in ms
  protected consumerTimeout = 0; // Rabbitmq timeout in ms default to 1800000ms (30 min) increase only if the job needs to run more than that, this value shouldn't be smaller than `timeout` (expect 0)
  protected disableConsuming = config.rabbitDisableQueuesConsuming;

  public async consume(channel: ChannelWrapper, consumeMessage: ConsumeMessage): Promise<void> {
    try {
      this.rabbitMqMessage = JSON.parse(consumeMessage.content.toString()) as RabbitMQMessage;
    } catch (error) {
      // Log the error
      logger.error(
        this.queueName,
        `Error parsing JSON: ${JSON.stringify(
          error
        )}, queueName=${this.getQueue()}, payload=${JSON.stringify(this.rabbitMqMessage)}`
      );

      channel.ack(consumeMessage);
      return;
    }

    if (this.rabbitMqMessage.jobId) {
      try {
        await extendLock(
          this.rabbitMqMessage.jobId,
          _.max([_.toInteger(this.getTimeout() / 1000), 0]) || 5 * 60
        );
      } catch {
        logger.warn(
          "rabbit-debug",
          `failed to release lock ${this.queueName} ${this.rabbitMqMessage.jobId}`
        );
        // Ignore errors
      }
    }

    this.rabbitMqMessage.consumedTime = this.rabbitMqMessage.consumedTime ?? _.now();
    this.rabbitMqMessage.retryCount = this.rabbitMqMessage.retryCount ?? 0;

    try {
      let processResult;
      if (this.getTimeout()) {
        processResult = await Promise.race([
          this.process(this.rabbitMqMessage.payload),
          new Promise((resolve, reject) => {
            setTimeout(
              () =>
                reject(
                  new Error(
                    `job timed out ${
                      this.getTimeout() / 1000
                    }s ${this.getQueue()} with payload ${consumeMessage.content.toString()}`
                  )
                ),
              this.getTimeout()
            );
          }),
        ]);
      } else {
        processResult = await this.process(this.rabbitMqMessage.payload); // Process the message
      }

      channel.ack(consumeMessage); // Ack the message with rabbit

      this.rabbitMqMessage.completeTime = _.now(); // Set the complete time

      // Release lock if there's a job id
      if (this.rabbitMqMessage.jobId) {
        try {
          await releaseLock(this.rabbitMqMessage.jobId);
        } catch {
          // Ignore errors
        }
      }

      try {
        await this.onCompleted(this.rabbitMqMessage, processResult);
      } catch {
        // Ignore errors
      }
    } catch (error) {
      try {
        await this.onError(this.rabbitMqMessage, error);
      } catch {
        // Ignore errors
      }

      this.rabbitMqMessage.retryCount += 1;
      let queueName = this.getQueue();

      // Set the backoff strategy delay
      let delay = this.getBackoffDelay(this.rabbitMqMessage);

      // If the event has already been retried maxRetries times, send it to the dead letter queue
      if (this.rabbitMqMessage.retryCount > this.maxRetries) {
        queueName = this.getDeadLetterQueue();
        delay = 0;
      }

      // Log the error
      logger.error(
        this.queueName,
        `Error handling event: ${JSON.stringify(
          error
        )}, queueName=${queueName}, payload=${JSON.stringify(this.rabbitMqMessage)}, retryCount=${
          this.rabbitMqMessage.retryCount
        }`
      );

      try {
        channel.ack(consumeMessage); // Ack the message with rabbit

        // Release lock if there's a job id
        if (this.rabbitMqMessage.jobId) {
          try {
            await releaseLock(this.rabbitMqMessage.jobId);
          } catch {
            // Ignore errors
          }
        }

        await RabbitMq.send(queueName, this.rabbitMqMessage, delay); // Trigger the retry / or send to dead letter queue
      } catch (error) {
        // Log the error
        logger.error(
          this.queueName,
          `Error handling catch: ${JSON.stringify(
            error
          )}, queueName=${queueName}, payload=${JSON.stringify(this.rabbitMqMessage)}, retryCount=${
            this.rabbitMqMessage.retryCount
          }`
        );
      }
    }
  }

  public async handle(payload: any) {
    return await this.process(payload);
  }

  // Function to handle on completed event
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async onCompleted(message: RabbitMQMessage, processResult: any) {
    return;
  }

  // Function to handle on error event
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async onError(message: RabbitMQMessage, error: any) {
    return;
  }

  public getBackoffDelay(message: RabbitMQMessage) {
    let delay = 0;
    if (this.backoff) {
      switch (this.backoff.type) {
        case "fixed":
          delay = this.backoff.delay;
          break;

        case "exponential":
          delay = (2 ^ (Number(message.retryCount) - 1)) * this.backoff.delay;
          break;
      }
    }

    return delay;
  }

  public getQueue(): string {
    return this.queueName;
  }

  public getDeadLetterQueue(): string {
    return `${this.getQueue()}-dead-letter`;
  }

  public getConcurrency(): number {
    return this.concurrency;
  }

  public getMaxDeadLetterQueue(): number {
    return this.maxDeadLetterQueue;
  }

  public getUseSharedChannel(): boolean {
    return this.useSharedChannel;
  }

  public isLazyMode(): boolean {
    return this.lazyMode;
  }

  public isDisableConsuming(): boolean {
    return this.disableConsuming;
  }

  public getSingleActiveConsumer(): boolean | undefined {
    return this.singleActiveConsumer ? this.singleActiveConsumer : undefined;
  }

  public getBackoff(): BackoffStrategy {
    return this.backoff;
  }

  public getQueueType(): string {
    return this.queueType;
  }

  public getConsumerTimeout(): number {
    return this.consumerTimeout;
  }

  public getTimeout(): number {
    return this.timeout;
  }

  protected async send(job: { payload?: any; jobId?: string } = {}, delay = 0, priority = 0) {
    await RabbitMq.send(
      this.getQueue(),
      {
        payload: job.payload,
        jobId: job?.jobId ? `${this.getQueue()}:${job?.jobId}` : undefined,
        persistent: this.persistent,
      },
      delay,
      priority
    );
  }

  protected async sendBatch(
    jobs: { payload: any; jobId?: string; delay?: number; priority?: number }[]
  ) {
    await RabbitMq.sendBatch(
      this.getQueue(),
      jobs.map((job) => ({
        content: {
          payload: job.payload,
          jobId: job?.jobId ? `${this.getQueue()}:${job?.jobId}` : undefined,
          persistent: this.persistent,
        },
        delay: job.delay,
        priority: job.priority,
      }))
    );
  }
}
