/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from "@/common/logger";
import { KafkaEventHandler } from "./KafkaEventHandler";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

import {
  EventKind as ProcessActivityEventKind,
  processActivityEventJob,
} from "@/jobs/activities/process-activity-event-job";

export class IndexerFillEventsHandler extends KafkaEventHandler {
  topicName = "indexer.public.fill_events_2";

  protected async handleInsert(payload: any, offset: string): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        before: payload.before,
        after: payload.after,
        trigger: "insert",
        offset,
      },
      eventKind: WebsocketEventKind.SaleEvent,
    });

    logger.info(
      "sales-latency",
      JSON.stringify({
        latency: new Date(payload.after.created_at).getTime() / 1000 - payload.after.timestamp,
        tx_hash: payload.after.tx_hash,
        log_index: payload.after.log_index,
        batch_index: payload.after.batch_index,
        block: payload.after.block,
        block_hash: payload.after.block_hash,
        order_kind: payload.after.order_kind,
      })
    );
  }

  protected async handleUpdate(payload: any, offset: string): Promise<void> {
    if (!payload.after) {
      return;
    }

    await WebsocketEventRouter({
      eventInfo: {
        before: payload.before,
        after: payload.after,
        trigger: "update",
        offset,
      },
      eventKind: WebsocketEventKind.SaleEvent,
    });

    try {
      const washTradingScoreChanged =
        payload.before.wash_trading_score !== payload.after.wash_trading_score;

      if (washTradingScoreChanged) {
        await processActivityEventJob.addToQueue([
          {
            kind: ProcessActivityEventKind.fillEvent,
            data: {
              txHash: payload.after.tx_hash,
              logIndex: payload.after.log_index,
              batchIndex: payload.after.batch_index,
            },
          },
        ]);

        logger.info(
          "kafka-event-handler",
          JSON.stringify({
            topic: "debugWashTradingScoreActivity",
            message: `Refresh sale activity. txHash=${payload.after.tx_hash} logIndex=${payload.after.log_index} batchIndex=${payload.after.batch_index}`,
            payload,
          })
        );
      }
    } catch (error) {
      logger.error(
        "kafka-event-handler",
        JSON.stringify({
          message: `Handle ask error. error=${error}`,
          payload,
          error,
        })
      );
    }
  }

  protected async handleDelete(): Promise<void> {
    // probably do nothing here
  }
}
