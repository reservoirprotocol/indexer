/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from "@/common/logger";
import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export class IndexerOrdersHandler extends KafkaEventHandler {
  topicName = "indexer.public.orders";

  protected async handleInsert(payload: any, offset: string): Promise<void> {
    if (!payload.after) {
      return;
    }

    let eventKind;

    if (payload.after.side === "sell") {
      eventKind = WebsocketEventKind.SellOrder;
    } else if (payload.after.side === "buy") {
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
        before: payload.before,
        after: payload.after,
        trigger: "insert",
        offset,
      },
      eventKind,
    });
  }

  protected async handleUpdate(payload: any, offset: string): Promise<void> {
    if (!payload.after) {
      return;
    }

    let eventKind;

    if (payload.after.side === "sell") {
      eventKind = WebsocketEventKind.SellOrder;
    } else if (payload.after.side === "buy") {
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
        before: payload.before,
        after: payload.after,
        trigger: "update",
        offset,
      },
      eventKind,
    });
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
