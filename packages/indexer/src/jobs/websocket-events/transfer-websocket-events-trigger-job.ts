import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { publishWebsocketEvent } from "@/common/websocketPublisher";
import crypto from "crypto";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

export type TransferWebsocketEventsTriggerQueueJobPayload = {
  data: TransferWebsocketEventInfo;
};

const changedMapping = {};

export class TransferWebsocketEventsTriggerQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "transfer-websocket-events-trigger-queue";
  maxRetries = 5;
  concurrency = 10;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 1000,
  } as BackoffStrategy;

  public async process(payload: TransferWebsocketEventsTriggerQueueJobPayload) {
    const { data } = payload;

    try {
      const result = {
        id: crypto
          .createHash("sha256")
          .update(`${data.after.tx_hash}${data.after.log_index}${data.after.batch_index}`)
          .digest("hex"),
        token: {
          contract: data.after.address,
          tokenId: data.after.token_id,
        },
        from: data.after.from,
        to: data.after.to,
        amount: data.after.amount,
        block: data.after.block,
        txHash: data.after.tx_hash,
        logIndex: data.after.log_index,
        batchIndex: data.after.batch_index,
        timestamp: data.after.timestamp,
        createdAt: new Date(data.after.created_at).toISOString(),
        updatedAt: new Date(data.after.updated_at).toISOString(),
      };

      let eventType = "";
      const changed = [];
      if (data.after.is_deleted) eventType = "transfer.deleted";
      else if (data.trigger === "insert") eventType = "transfer.created";
      else if (data.trigger === "update") {
        eventType = "transfer.updated";
        if (data.before) {
          for (const key in changedMapping) {
            if (data.before[key as keyof TransferInfo] !== data.after[key as keyof TransferInfo]) {
              changed.push(changedMapping[key as keyof typeof changedMapping]);
            }
          }

          if (!changed.length) {
            try {
              for (const key in data.after) {
                const beforeValue = data.before[key as keyof TransferInfo];
                const afterValue = data.after[key as keyof TransferInfo];

                if (beforeValue !== afterValue) {
                  changed.push(key as keyof TransferInfo);
                }
              }

              logger.info(
                this.queueName,
                JSON.stringify({
                  message: `No changes detected for transfer. contract=${data.after.address}, tokenId=${data.after.token_id}`,
                  data,
                  beforeJson: JSON.stringify(data.before),
                  afterJson: JSON.stringify(data.after),
                  changed,
                  changedJson: JSON.stringify(changed),
                  hasChanged: changed.length > 0,
                })
              );
            } catch (error) {
              logger.error(
                this.queueName,
                JSON.stringify({
                  message: `No changes detected for transfer error. contract=${data.after.address}, tokenId=${data.after.token_id}`,
                  data,
                  changed,
                  error,
                })
              );
            }

            return;
          }
        }
      }

      await publishWebsocketEvent({
        event: eventType,
        tags: {
          address: result.token.contract,
          from: result.from,
          to: result.to,
        },
        //changed,
        data: result,
        offset: data.offset,
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

  public async addToQueue(events: TransferWebsocketEventsTriggerQueueJobPayload[]) {
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

export type EventInfo = {
  data: TransferWebsocketEventInfo;
};

interface TransferInfo {
  address: string;
  block: string;
  tx_hash: string;
  tx_index: string;
  log_index: string;
  batch_index: string;
  timestamp: string;
  from: string;
  to: string;
  token_id: string;
  amount: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export type TransferWebsocketEventInfo = {
  before: TransferInfo;
  after: TransferInfo;
  trigger: "insert" | "update" | "delete";
  offset: string;
};

export const transferWebsocketEventsTriggerQueueJob = new TransferWebsocketEventsTriggerQueueJob();
