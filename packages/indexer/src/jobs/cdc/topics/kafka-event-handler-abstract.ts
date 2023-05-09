/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
import { kafkaProducer } from "@/common/kafka";

export abstract class KafkaEventHandler {
  abstract topicName: string;
  maxRetries = 5;

  async handle(payload: any): Promise<void> {
    try {
      switch (payload.op) {
        case "c":
          this.handleInsert(payload);
          break;
        case "u":
          this.handleUpdate(payload);
          break;
        case "d":
          this.handleDelete();
          break;
        default:
          logger.error(this.topicName, `Unknown operation type: ${payload.op}`);
          break;
      }
    } catch (error) {
      payload.retryCount += 1;
      let topicToSendTo = `${this.topicName}-error`;

      // If the event has already been retried maxRetries times, send it to the dead letter queue
      if (payload.retryCount > this.maxRetries) {
        topicToSendTo = `${this.topicName}-dead-letter`;
      }

      logger.error(
        this.topicName,
        `Error handling event: ${error}, topicToSendTo=${topicToSendTo}, payload=${JSON.stringify(
          payload
        )}, retryCount=${payload.retryCount}`
      );

      kafkaProducer.send({
        topic: topicToSendTo,
        messages: [
          {
            value: JSON.stringify({
              error: JSON.stringify(error),
              payload,
            }),
          },
        ],
      });
    }
  }

  getTopics(): string[] {
    // return this topic name, as well as an error topic name and a dead letter topic name
    return [this.topicName, `${this.topicName}-error`];
  }

  protected abstract handleInsert(payload: any): Promise<void>;
  protected abstract handleUpdate(payload: any): Promise<void>;
  protected abstract handleDelete(): Promise<void>;
}
