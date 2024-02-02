import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { PendingItem } from "@/utils/pending-txs";

import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

export type PendingTxWebsocketEventsTriggerQueueJobPayload = {
  data: PendingTxWebsocketEventInfo;
};

export class PendingTxWebsocketEventsTriggerQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "pending-tx-websocket-events-trigger-queue";
  maxRetries = 5;
  concurrency = 10;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 1000,
  } as BackoffStrategy;

  public async process(payload: PendingTxWebsocketEventsTriggerQueueJobPayload) {
    const { data } = payload;

    try {
      let eventType = "";
      if (data.trigger === "created") {
        eventType = "pending-tx.created";
      } else if (data.trigger === "deleted") {
        eventType = "pending-tx.deleted";
      }
      await publishWebsocketEvent({
        event: eventType,
        tags: {
          contract: data.item.contract,
        },
        changed: [],
        data: data.item,
      });
    } catch (error) {
      logger.error(
        this.queueName,
        `Error processing websocket event. data=${JSON.stringify(data)}, error=${JSON.stringify(
          error
        )}`
      );
      throw error;
    }
  }

  public async addToQueue(events: PendingTxWebsocketEventsTriggerQueueJobPayload[]) {
    if (!config.doWebsocketServerWork) {
      return;
    }

    await this.sendBatch(
      events.map((event) => ({
        payload: event,
      }))
    );
  }
}
export type PendingTxWebsocketEventInfo = {
  item: PendingItem;
  trigger: "created" | "deleted";
};

export const pendingTxWebsocketEventsTriggerQueueJob =
  new PendingTxWebsocketEventsTriggerQueueJob();
