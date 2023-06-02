/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from "ethers";
import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import { config } from "@/config/index";

export class IndexerOrdersHandler extends KafkaEventHandler {
  topicName = "indexer.public.orders";

  protected async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    if (!config.doOldOrderWebsocketWork) {
      let eventKind;
      if (payload.after.side === "sell") {
        eventKind = WebsocketEventKind.SellOrder;
      } else if (payload.after.kind === "buy") {
        eventKind = WebsocketEventKind.BuyOrder;
      } else {
        logger.warn(
          "kafka-event-handler",
          `${this.topicName}: Unknown order kind, skipping websocket event router for order=${
            JSON.stringify(payload.after) || "null"
          }`
        );
        return;
      }

      await WebsocketEventRouter({
        eventInfo: {
          kind: payload.after.kind,
          orderId: payload.after.id,
          trigger: "insert",
        },
        eventKind,
      });
    } else {
      logger.info(
        "kafka-event-handler",
        `${
          this.topicName
        }: Old order websocket work is enabled, skipping websocket event router for order=${
          JSON.stringify(payload.after) || "null"
        }`
      );
    }
  }

  protected async handleUpdate(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    if (!config.doOldOrderWebsocketWork) {
      let eventKind;
      if (payload.after.side === "sell") {
        eventKind = WebsocketEventKind.SellOrder;
      } else if (payload.after.kind === "buy") {
        eventKind = WebsocketEventKind.BuyOrder;
      } else {
        logger.warn(
          "kafka-event-handler",
          `${this.topicName}: Unknown order kind, skipping websocket event router for order=${
            JSON.stringify(payload.after) || "null"
          }`
        );
        return;
      }

      await WebsocketEventRouter({
        eventInfo: {
          kind: payload.after.kind,
          orderId: payload.after.id,
          trigger: "update",
        },
        eventKind: eventKind,
      });
    } else {
      logger.info(
        "kafka-event-handler",
        `${
          this.topicName
        }: Old order websocket work is enabled, skipping websocket event router for order=${
          JSON.stringify(payload.after) || "null"
        }`
      );
    }
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
