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
import { EventKind, processAskEventJob } from "@/jobs/elasticsearch/asks/process-ask-event-job";
import { formatStatus } from "@/jobs/websocket-events/utils";

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

    if (payload.after.side === "sell") {
      await this.handleSellOrder(payload);

      const afterStatus = formatStatus(
        payload.after.fillability_status,
        payload.after.approval_status
      );

      if (afterStatus === "active") {
        await processAskEventJob.addToQueue([
          {
            kind: EventKind.newSellOrder,
            data: payload.after,
          },
        ]);
      }
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
      // logger.warn(
      //   "kafka-event-handler",
      //   `${this.topicName}: Unknown order kind, skipping websocket event router for order=${
      //     JSON.stringify(payload.after) || "null"
      //   }`
      // );

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

    if (payload.after.side === "sell") {
      try {
        const beforeStatus = formatStatus(
          payload.before.fillability_status,
          payload.before.approval_status
        );
        const afterStatus = formatStatus(
          payload.after.fillability_status,
          payload.after.approval_status
        );

        if (afterStatus === "active") {
          await processAskEventJob.addToQueue([
            {
              kind: EventKind.sellOrderUpdated,
              data: payload.after,
            },
          ]);
        } else if (beforeStatus === "active") {
          await processAskEventJob.addToQueue([
            {
              kind: EventKind.SellOrderInactive,
              data: payload.after,
            },
          ]);
        }
      } catch (error) {
        logger.error(
          "kafka-event-handler",
          JSON.stringify({
            topic: "debugAskIndex",
            message: `Handle ask error. error=${error}`,
            payload,
            error,
          })
        );
      }
    }
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
          message: `Handle sell order error. error=${error}`,
          payload,
          error,
        })
      );
    }
  }
}
