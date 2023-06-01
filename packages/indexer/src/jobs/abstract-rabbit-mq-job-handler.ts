/* eslint-disable @typescript-eslint/no-explicit-any */

// Abstract class needed to be implemented in order to process job from rabbit
import { RabbitMq, RabbitMQMessage } from "@/common/rabbit-mq";
import { logger } from "@/common/logger";
import _ from "lodash";
import { getNetworkName } from "@/config/network";
import EventEmitter from "events";
import TypedEmitter from "typed-emitter";

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

export type AbstractRabbitMqJobHandlerEvents = {
  onCompleted: (message: RabbitMQMessage) => void;
  onError: (message: RabbitMQMessage, error: any) => void;
};

export abstract class AbstractRabbitMqJobHandler extends (EventEmitter as new () => TypedEmitter<AbstractRabbitMqJobHandlerEvents>) {
  abstract queueName: string;
  abstract maxRetries: number;

  protected abstract process(payload: any): Promise<void>;

  protected concurrency = 1;
  protected maxDeadLetterQueue = 5000;
  protected backoff: BackoffStrategy = null;

  public async consume(message: RabbitMQMessage): Promise<void> {
    message.consumedTime = message.consumedTime ?? _.now();
    message.retryCount = message.retryCount ?? 0;

    try {
      await this.process(message.payload);
      message.completeTime = _.now();
    } catch (error) {
      message.retryCount += 1;
      this.emit("onError", message, error);
      let queueName = this.getRetryQueue();

      // If the event has already been retried maxRetries times, send it to the dead letter queue
      if (message.retryCount > this.maxRetries) {
        queueName = this.getDeadLetterQueue();
      }

      logger.error(
        this.queueName,
        `Error handling event: ${error}, queueName=${queueName}, payload=${JSON.stringify(
          message
        )}, retryCount=${message.retryCount}`
      );

      // Set the backoff strategy delay
      const delay = this.getBackoffDelay(message);

      await RabbitMq.send(queueName, message, delay);
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

  public getBackoff(): BackoffStrategy {
    return this.backoff;
  }

  protected async send(job: { payload: any; jobId?: string }, delay = 0, priority = 0) {
    await RabbitMq.send(
      this.getQueue(),
      { payload: job.payload, jobId: `${this.getQueue()}:${job.jobId}` },
      delay,
      priority
    );
  }

  protected async sendBatch(job: { payload: any; jobId?: string }[], delay = 0, priority = 0) {
    await RabbitMq.sendBatch(
      this.getQueue(),
      job.map((j) => ({ payload: j.payload, jobId: `${this.getQueue()}:${j.jobId}` })),
      delay,
      priority
    );
  }
}
