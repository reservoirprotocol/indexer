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

    // eslint-disable-next-line
    console.log("payload.after", payload.after);

    if (!config.doOldOrderWebsocketWork) {
      await WebsocketEventRouter({
        eventInfo: {
          kind: payload.after.kind,
          orderId: payload.after.id,
          trigger: "insert",
        },
        eventKind:
          payload.after.side === "sell"
            ? WebsocketEventKind.SellOrder
            : WebsocketEventKind.BuyOrder,
      });
    } else {
      logger.info(
        this.topicName,
        `Old order websocket work is enabled, skipping websocket event router for order=${
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
      await WebsocketEventRouter({
        eventInfo: {
          kind: payload.after.kind,
          orderId: payload.after.id,
          trigger: "update",
        },
        eventKind:
          payload.after.side === "sell"
            ? WebsocketEventKind.SellOrder
            : WebsocketEventKind.BuyOrder,
      });
    } else {
      logger.info(
        this.topicName,
        `Old order websocket work is enabled, skipping websocket event router for order=${
          JSON.stringify(payload.after) || "null"
        }`
      );
    }
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
