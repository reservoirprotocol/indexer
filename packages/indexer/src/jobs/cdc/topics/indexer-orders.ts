/* eslint-disable @typescript-eslint/no-explicit-any */
import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export class IndexerOrdersHandler extends KafkaEventHandler {
  topicName = "indexer.public.orders";

  protected async handleInsert(payload: any): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        kind: payload.after.kind,
        orderId: payload.after.order_id,
        trigger: "insert",
      },
      eventKind:
        payload.after.side === "sell" ? WebsocketEventKind.SellOrder : WebsocketEventKind.BuyOrder,
    });

    // all other cases, trigger ask.updated event
  }

  protected async handleUpdate(payload: any): Promise<void> {
    await WebsocketEventRouter({
      eventInfo: {
        kind: payload.after.kind,
        orderId: payload.after.order_id,
        trigger: "update",
      },
      eventKind:
        payload.after.side === "sell" ? WebsocketEventKind.SellOrder : WebsocketEventKind.BuyOrder,
    });
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
