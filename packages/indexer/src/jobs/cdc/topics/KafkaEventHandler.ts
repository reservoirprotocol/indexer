/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
// import { producer } from "..";
import { base64ToHex, isBase64 } from "@/common/utils";
import { getNetworkName } from "@/config/network";
import { BigNumber } from "ethers";

export abstract class KafkaEventHandler {
  abstract topicName: string;
  maxRetries = 5;

  async handle(payload: any, offset: string): Promise<void> {
    try {
      // convert any hex strings to strings

      switch (payload.op) {
        case "c":
          this.convertPayloadHexToString(payload);
          this.handleInsert(payload, offset);
          break;
        case "u":
          this.convertPayloadHexToString(payload);
          this.handleUpdate(payload, offset);
          break;
        case "d":
          this.handleDelete();
          break;
        default:
          logger.error(
            "kafka-event-handler",
            `${this.topicName}: Unknown operation type: ${payload.op}`
          );
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
        "kafka-event-handler",
        `${
          this.topicName
        }: Error handling event: ${error}, topicToSendTo=${topicToSendTo}, payload=${JSON.stringify(
          payload
        )}, retryCount=${payload.retryCount}`
      );

      // producer.send({
      //   topic: topicToSendTo,
      //   messages: [
      //     {
      //       value: JSON.stringify({
      //         error: JSON.stringify(error),
      //         payload,
      //       }),
      //     },
      //   ],
      // });
    }
  }

  getTopics(): string[] {
    // return this topic name, as well as an error topic name
    return [`${getNetworkName()}.${this.topicName}`, `${getNetworkName()}.${this.topicName}-error`];
  }

  convertPayloadHexToString(payload: any) {
    const numericKeys = ["amount", "token_id"];

    // go through all the keys in the payload and convert any hex strings to strings
    // This is necessary because debeezium converts bytea values and other non string values to base64 strings
    for (const key in payload.after) {
      if (isBase64(payload.after[key])) {
        payload.after[key] = base64ToHex(payload.after[key]);
        // if the key is a numeric key, convert the value to a number (hex -> number -> string)
        if (numericKeys.includes(key) && typeof payload.after[key] === "string") {
          payload.after[key] = BigNumber.from(payload.after[key]).toString();
        }
      }
    }

    for (const key in payload.before) {
      if (isBase64(payload.before[key])) {
        payload.before[key] = base64ToHex(payload.before[key]);
        // if the key is a numeric key, convert the value to a number (hex -> number -> string)
        if (numericKeys.includes(key) && typeof payload.before[key] === "string") {
          payload.before[key] = BigNumber.from(payload.before[key]).toString();
        }
      }
    }
  }

  protected abstract handleInsert(payload: any, offset: string): Promise<void>;
  protected abstract handleUpdate(payload: any, offset: string): Promise<void>;
  protected abstract handleDelete(): Promise<void>;
}
