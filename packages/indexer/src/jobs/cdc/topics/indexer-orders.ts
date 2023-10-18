/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from "@/common/logger";
import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import { Collections } from "@/models/collections";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { acquireLock } from "@/common/redis";
import { Tokens } from "@/models/tokens";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";
import {
  EventKind,
  processTokenListingEventJob,
} from "@/jobs/token-listings/process-token-listing-event-job";

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
    try {
      if (
        payload.after.fillability_status === "fillable" &&
        payload.after.approval_status === "approved"
      ) {
        const [, contract, tokenId] = payload.after.token_set_id.split(":");

        const acquiredLock = await acquireLock(
          `fetch-ask-token-metadata-lock:${contract}:${tokenId}`,
          86400
        );

        if (acquiredLock) {
          const token = await Tokens.getByContractAndTokenId(contract, tokenId);

          if (!token?.image && !token?.name) {
            logger.info(
              "kafka-event-handler",
              JSON.stringify({
                topic: "handleSellOrder",
                message: `Refreshing token metadata. contract=${contract}, tokenId=${tokenId}`,
                payload,
                contract,
                tokenId,
              })
            );

            const collection = await Collections.getByContractAndTokenId(contract, tokenId);

            await metadataIndexFetchJob.addToQueue(
              [
                {
                  kind: "single-token",
                  data: {
                    method: collection?.community
                      ? metadataIndexFetchJob.getIndexingMethod(collection?.community)
                      : "simplehash",
                    contract,
                    tokenId,
                    collection: collection?.id || contract,
                  },
                  context: "kafka-event-handler",
                },
              ],
              true
            );

            await PendingFlagStatusSyncTokens.add(
              [
                {
                  contract,
                  tokenId,
                },
              ],
              true
            );
          }
        }
      }
    } catch (error) {
      logger.error(
        "kafka-event-handler",
        JSON.stringify({
          topic: "handleSellOrder",
          message: "Handle sell order error. error=${error}",
          payload,
          error,
        })
      );
    }
  }
}
