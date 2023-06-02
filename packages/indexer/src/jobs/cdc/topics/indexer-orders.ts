/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from "@/common/logger";
import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";

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
          kind: payload.after.kind,
          orderId: payload.after.id,
          trigger: "insert",
        },
        eventKind,
      });

      try {
        const orderStart = Math.floor(
          new Date(
            payload.after.originated_at ?? JSON.parse(payload.after.valid_between)[0]
          ).getTime() / 1000
        );

        const orderCreated = Math.floor(new Date(payload.after.created_at).getTime() / 1000);
        const source = (await Sources.getInstance()).get(payload.after.source_id_int);
        const orderType =
          payload.after.side === "sell"
            ? "listing"
            : payload.after.token_set_id?.startsWith("token")
            ? "token_offer"
            : payload.after.token_set_id?.startsWith("list")
            ? "attribute_offer"
            : "collection_offer";

        if (orderStart <= orderCreated) {
          logger.info(
            "order-latency-metric",
            JSON.stringify({
              latency: orderCreated - orderStart,
              source: source?.getTitle(),
              orderId: payload.after.id,
              orderKind: payload.after.kind,
              orderType,
              orderCreatedAt: new Date(payload.after.created_at).toISOString(),
              orderValidFrom: new Date(JSON.parse(payload.after.valid_between)[0]).toISOString(),
              orderOriginatedAt: payload.after.originated_at
                ? new Date(payload.after.originated_at).toISOString()
                : null,
            })
          );
        }
      } catch (error) {
        logger.error("kafka-event-handler", `Unable to generate metric. error=${error}`);
      }
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
