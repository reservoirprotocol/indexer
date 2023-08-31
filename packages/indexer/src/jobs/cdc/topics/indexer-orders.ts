/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from "@/common/logger";
import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import {
  EventKind,
  processTokenListingEventJob,
} from "@/jobs/token-listings/process-token-listing-event-job";
import { Collections } from "@/models/collections";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { config } from "@/config/index";

export class IndexerOrdersHandler extends KafkaEventHandler {
  topicName = "indexer.public.orders";

  protected async handleInsert(payload: any, offset: string): Promise<void> {
    if (!payload.after) {
      return;
    }

    let eventKind;

    if (payload.after.side === "sell") {
      eventKind = WebsocketEventKind.SellOrder;

      await processTokenListingEventJob.addToQueue([
        {
          kind: EventKind.newSellOrder,
          data: payload.after,
        },
      ]);
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

    if (payload.after.side === "sell") {
      await this.handleSellOrder(payload);
    }
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

  async handleSellOrder(payload: any): Promise<void> {
    if (
      payload.after.fillability_status === "fillable" &&
      payload.after.approval_status === "approved"
    ) {
      const [, contract, tokenId] = payload.after.token_set_id.split(":");

      logger.info(
        "kafka-event-handler",
        JSON.stringify({
          message: "Refreshing token metadata.",
          payload,
          contract,
          tokenId,
        })
      );

      if (config.chainId === 5) {
        const collection = await Collections.getByContractAndTokenId(contract, tokenId);

        await metadataIndexFetchJob.addToQueue(
          [
            {
              kind: "single-token",
              data: {
                method: metadataIndexFetchJob.getIndexingMethod(collection?.community || null),
                contract,
                tokenId,
                collection: collection?.id || contract,
              },
              context: "post-flag-token-v1",
            },
          ],
          true
        );
      }
    }
  }
}
