import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingItem } from "@/utils/pending-txs";
import { publishKafkaEvent } from "@/jobs/websocket-events/utils";

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
      const lockKey = `${this.queueName}:duplicates-lock:${data.item.contract}-${data.item.tokenId}-${data.item.txHash}-${data.trigger}`;
      const lock = await redis.get(lockKey);
      if (!lock) {
        await redis.set(lockKey, "locked", "EX", 30);

        let eventType = "";
        if (data.trigger === "created") {
          eventType = "pending-tx.created";
        } else if (data.trigger === "deleted") {
          eventType = "pending-tx.deleted";
        }

        const event = {
          event: eventType,
          changed: [],
          data: data.item,
        };

        await publishWebsocketEvent({
          ...event,
          tags: {
            contract: data.item.contract,
          },
        });

        await publishKafkaEvent(event);
      }
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
        jobId: `${event.data.item.contract}-${event.data.item.tokenId}-${event.data.item.txHash}-${event.data.trigger}`,
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
