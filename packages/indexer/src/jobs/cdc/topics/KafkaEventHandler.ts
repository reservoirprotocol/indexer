/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
// import { producer } from "..";
import { base64ToHex, isBase64 } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";
import { BigNumber } from "ethers";

export abstract class KafkaEventHandler {
  abstract topicName: string;
  maxRetries = 5;

  async handle(payload: any, offset: string): Promise<void> {
    try {
      // convert any hex strings to strings

      if (
        payload.op === "u" &&
        config.chainId === 137 &&
        this.topicName === "indexer.public.nft_transfer_events"
      ) {
        return;
      }

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
          this.convertPayloadHexToString(payload);
          this.handleDelete(payload, offset);
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
    return [`${getNetworkName()}.${this.topicName}`];
  }

  convertPayloadHexToString(payload: any) {
    const numericKeys = [
      "amount",
      "token_id",
      "price",
      "usd_price",
      "currency_price",
      "quantity_filled",
      "quantity_remaining",
      "nonce",
      "supply",
      "remaining_supply",
      "floor_sell_value",
      "floor_sell_currency_value",
      "normalized_floor_sell_value",
      "normalized_floor_sell_currency_value",
    ];

    // Handling for fields that should not be converted
    const stringKeys = payload.source.table === "token_attributes" ? ["key", "value"] : [];
    if (payload.source.table === "orders") {
      stringKeys.push("kind", "fillability_status", "approval_status");
    }
    if (payload.source.table === "collections") {
      stringKeys.push("name", "slug");
    }
    if (payload.source.table === "fill_events_2") {
      stringKeys.push("order_kind");
    }

    // go through all the keys in the payload and convert any hex strings to strings
    // This is necessary because debeezium converts bytea values and other non string values to base64 strings
    for (const key in payload.after) {
      // For numbers which get converted to objects, convert them back to numbers
      if (payload.after[key]?.value) {
        payload.after[key] = payload.after[key]?.value;
      }

      if (isBase64(payload.after[key]) && !stringKeys.includes(key)) {
        payload.after[key] = base64ToHex(payload.after[key]);
        // if the key is a numeric key, convert the value to a number (hex -> number -> string)
        if (numericKeys.includes(key) && typeof payload.after[key] === "string") {
          payload.after[key] = BigNumber.from(payload.after[key]).toString();
        }
      }
    }

    for (const key in payload.before) {
      // For numbers which get converted to objects, convert them back to numbers
      if (payload.before[key]?.value) {
        payload.before[key] = payload.before[key]?.value;
      }

      if (isBase64(payload.before[key]) && !stringKeys.includes(key)) {
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
  protected abstract handleDelete(payload: any, offset: string): Promise<void>;
}
