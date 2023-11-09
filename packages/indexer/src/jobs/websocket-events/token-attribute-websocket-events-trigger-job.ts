import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

export type TokenAttributeWebsocketEventsTriggerQueueJobPayload = {
  data: TokenAttributeWebsocketEventInfo;
};

// TODO - populate mapping based on update logs
const changedMapping = {};

export class TokenAttributeWebsocketEventsTriggerQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "token-attribute-websocket-events-trigger-queue";
  maxRetries = 5;
  concurrency = 10;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 1000,
  } as BackoffStrategy;

  public async process(payload: TokenAttributeWebsocketEventsTriggerQueueJobPayload) {
    const { data } = payload;

    try {
      let eventType = "";
      const changed = [];
      switch (data.trigger) {
        case "insert":
          eventType = "token-attribute.created";
          break;
        case "update":
          eventType = "token-attribute.updated";
          if (data.before) {
            for (const key in changedMapping) {
              if (
                data.before[key as keyof TokenAttributeInfo] !==
                data.after[key as keyof TokenAttributeInfo]
              ) {
                changed.push(changedMapping[key as keyof typeof changedMapping]);
              }
            }

            if (!changed.length) {
              try {
                for (const key in data.after) {
                  const beforeValue = data.before[key as keyof TokenAttributeInfo];
                  const afterValue = data.after[key as keyof TokenAttributeInfo];

                  if (beforeValue !== afterValue) {
                    changed.push(key as keyof TokenAttributeInfo);
                  }
                }

                logger.info(
                  this.queueName,
                  JSON.stringify({
                    message: `No changes detected for token attribute. contract=${data.after.contract}, tokenId=${data.after.token_id}, key=${data.after.key}, value=${data.after.value}`,
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
                    message: `No changes detected for token attribute error. contract=${data.after.contract}, tokenId=${data.after.token_id}, key=${data.after.key}, value=${data.after.value}`,
                    data,
                    changed,
                    error,
                  })
                );
              }

              return;
            }
          }
          break;
        case "delete":
          eventType = "token-attribute.deleted";
          if (data.before) {
            for (const key in changedMapping) {
              changed.push(key);
            }
          }
          break;
      }

      const result = data.trigger === "delete" ? data.before : data.after;

      await publishWebsocketEvent({
        event: eventType,
        tags: {
          token_id: result.token_id,
          contract: result.contract,
        },
        changed,
        data: {
          token: {
            contract: result.contract,
            tokenId: result.token_id,
          },
          collection: {
            id: result.collection_id,
          },
          key: result.key,
          value: result.value,
          createdAt: result.created_at,
          updatedAt: result.updated_at,
        },
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

  public async addToQueue(events: TokenAttributeWebsocketEventsTriggerQueueJobPayload[]) {
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
  data: TokenAttributeWebsocketEventInfo;
};

interface TokenAttributeInfo {
  contract: string;
  token_id: string;
  collection_id: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export type TokenAttributeWebsocketEventInfo = {
  before: TokenAttributeInfo;
  after: TokenAttributeInfo;
  trigger: "insert" | "update" | "delete";
};

export const tokenAttributeWebsocketEventsTriggerQueueJob =
  new TokenAttributeWebsocketEventsTriggerQueueJob();
