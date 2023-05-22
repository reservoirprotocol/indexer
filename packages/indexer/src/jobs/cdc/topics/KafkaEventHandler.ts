/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
import { producer } from "..";
import { base64ToHex } from "@/common/utils";
import { getNetworkName } from "@/config/network";

export abstract class KafkaEventHandler {
  abstract topicName: string;
  maxRetries = 5;

  async handle(event: any, key: any): Promise<void> {
    try {
      // convert any hex strings to strings
      this.convertPayloadHexToString(event.payload, key);

      switch (event.payload.op) {
        case "c":
          this.handleInsert(event.payload);
          break;
        case "u":
          this.handleUpdate(event.payload);
          break;
        case "d":
          this.handleDelete();
          break;
        default:
          logger.error(this.topicName, `Unknown operation type: ${event.payload.op}`);
          break;
      }
    } catch (error) {
      event.payload.retryCount += 1;
      let topicToSendTo = `${this.topicName}-error`;

      // If the event has already been retried maxRetries times, send it to the dead letter queue
      if (event.payload.retryCount > this.maxRetries) {
        topicToSendTo = `${this.topicName}-dead-letter`;
      }

      logger.error(
        this.topicName,
        `Error handling event: ${error}, topicToSendTo=${topicToSendTo}, payload=${JSON.stringify(
          event.payload
        )}, retryCount=${event.payload.retryCount}`
      );

      producer.send({
        topic: topicToSendTo,
        messages: [
          {
            value: JSON.stringify({
              error: JSON.stringify(error),
              payload: event.payload,
            }),
          },
        ],
      });
    }
  }

  getTopics(): string[] {
    // return this topic name, as well as an error topic name
    return [`${getNetworkName()}.${this.topicName}`, `${getNetworkName()}.${this.topicName}-error`];
  }

  convertPayloadHexToString(payload: any, keyPayload: any) {
    // go through all the keys in the payload and convert any hex strings to strings
    // This is necessary because debeezium converts bytea values and other non string values to base64 strings
    for (const key in keyPayload.payload.after) {
      payload.after[key] = base64ToHex(payload.after[key]);
      // if the key is a numeric key, convert the value to a number (hex -> number -> string)

      for (const type of keyPayload.schema.fields) {
        if (
          type.field === key &&
          type?.name &&
          type?.name === "org.apache.kafka.connect.data.Decimal"
        ) {
          payload.after[key] = Number(payload.after[key]).toString();
        }
      }
    }
  }

  protected abstract handleInsert(payload: any): Promise<void>;
  protected abstract handleUpdate(payload: any): Promise<void>;
  protected abstract handleDelete(): Promise<void>;
}
