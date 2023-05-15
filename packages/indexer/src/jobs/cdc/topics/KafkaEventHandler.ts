import { logger } from "@/common/logger";
import { producer } from "..";
import { base64ToHex, isBase64 } from "@/common/utils";

export abstract class KafkaEventHandler {
  abstract topicName: string;
  maxRetries = 5;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async handle(payload: any): Promise<void> {
    try {
      payload = JSON.parse(payload.value.toString());

      // convert any hex strings to strings
      this.convertPayloadHexToString(payload);

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
          // logger.error(this.topicName, `Unknown operation type: ${payload.op}`);
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

      producer.send({
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  convertPayloadHexToString(payload: any) {
    // go through all the keys in the payload and convert any hex strings to strings

    for (const key in payload.after) {
      if (isBase64(payload.after[key])) {
        payload.after[key] = base64ToHex(payload.after[key]);
      }
    }

    for (const key in payload.before) {
      if (isBase64(payload.before[key])) {
        payload.before[key] = base64ToHex(payload.before[key]);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract handleInsert(payload: any): Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract handleUpdate(payload: any): Promise<void>;
  protected abstract handleDelete(): Promise<void>;
}
