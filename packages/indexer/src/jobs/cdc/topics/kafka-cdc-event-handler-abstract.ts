/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
import { KafkaEventHandler } from "@/common/kafka";

export abstract class KafkaCdcEventHandler extends KafkaEventHandler {
  maxRetries = 5;

  async process(payload: any): Promise<void> {
    switch (payload.op) {
      case "c":
        await this.handleInsert(payload);
        break;

      case "u":
        await this.handleUpdate(payload);
        break;

      case "d":
        await this.handleDelete();
        break;

      default:
        logger.error(this.topicName, `Unknown operation type: ${payload.op}`);
        break;
    }
  }

  getTopics(): string[] {
    // return this topic name, as well as an error topic name
    return [this.topicName, `${this.topicName}-error`];
  }

  protected abstract handleInsert(payload: any): Promise<void>;
  protected abstract handleUpdate(payload: any): Promise<void>;
  protected abstract handleDelete(): Promise<void>;
}
