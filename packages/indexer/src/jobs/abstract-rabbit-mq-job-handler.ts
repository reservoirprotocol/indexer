/* eslint-disable @typescript-eslint/no-explicit-any */

// Abstract class needed to be implemented in order to process job from rabbit
import { RabbitMq, RabbitMQMessage } from "@/common/rabbit-mq";
import { logger } from "@/common/logger";
import _ from "lodash";
import { getNetworkName } from "@/config/network";
import EventEmitter from "events";
import TypedEmitter from "typed-emitter";
import { Channel, ConsumeMessage } from "amqplib";
import { releaseLock } from "@/common/redis";

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

export type AbstractRabbitMqJobHandlerEvents = {
  onCompleted: (message: RabbitMQMessage, processResult: any) => void;
  onError: (message: RabbitMQMessage, error: any) => void;
};

export abstract class AbstractRabbitMqJobHandler extends (EventEmitter as new () => TypedEmitter<AbstractRabbitMqJobHandlerEvents>) {
  static defaultMaxDeadLetterQueue = 5000;

  abstract queueName: string;
  abstract maxRetries: number;

  protected abstract process(payload: any): Promise<any>;

  protected concurrency = 1;
  protected maxDeadLetterQueue = 5000;
  protected backoff: BackoffStrategy = null;
  protected singleActiveConsumer: boolean | undefined;
  protected persistent = true;
  protected useSharedChannel = false;
  protected lazyMode = false;
  protected queueType: QueueType = "classic";
  protected consumerTimeout = 0;
  protected disableConsuming = false;

  public async consume(channel: Channel, consumeMessage: ConsumeMessage): Promise<void> {
    const message = JSON.parse(consumeMessage.content.toString()) as RabbitMQMessage;

    message.consumedTime = message.consumedTime ?? _.now();
    message.retryCount = message.retryCount ?? 0;

    try {
      const processResult = await this.process(message.payload); // Process the message
      message.completeTime = _.now(); // Set the complete time
      await channel.ack(consumeMessage); // Ack the message with rabbit
      this.emit("onCompleted", message, processResult); // Emit on Completed event

      // Release lock if there's a job id with no delay
      if (message.jobId && !message.delay) {
        await releaseLock(message.jobId).catch();
      }
    } catch (error) {
      this.emit("onError", message, error); // Emit error event

      message.retryCount += 1;
      let queueName = this.getRetryQueue();

      // Set the backoff strategy delay
      let delay = this.getBackoffDelay(message);

      // If the event has already been retried maxRetries times, send it to the dead letter queue
      if (message.retryCount > this.maxRetries) {
        queueName = this.getDeadLetterQueue();
        delay = 0;
      }

      // Log the error
      logger.error(
        this.queueName,
        `Error handling event: ${JSON.stringify(
          error
        )}, queueName=${queueName}, payload=${JSON.stringify(message)}, retryCount=${
          message.retryCount
        }`
      );

      await channel.ack(consumeMessage); // Ack the message with rabbit
      await RabbitMq.send(queueName, message, delay); // Trigger the retry / or send to dead letter queue
    }
  }

  public getBackoffDelay(message: RabbitMQMessage) {
    let delay = 0;
    if (this.backoff) {
      switch (this.backoff.type) {
        case "fixed":
          delay = this.backoff.delay;
          break;

        case "exponential":
          delay = 2 ^ ((Number(message.retryCount) - 1) * this.backoff.delay);
          break;
      }
    }

    return delay;
  }

  public getQueue(): string {
    return `${getNetworkName()}.${this.queueName}`;
  }

  public getRetryQueue(queueName?: string): string {
    if (queueName) {
      return `${queueName}-retry`;
    }

    return `${this.getQueue()}-retry`;
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

  public async send(job: { payload?: any; jobId?: string } = {}, delay = 0, priority = 0) {
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
