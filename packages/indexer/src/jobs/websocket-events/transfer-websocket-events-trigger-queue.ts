import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { randomUUID } from "crypto";
import _ from "lodash";

import { publishWebsocketEvent } from "@/common/websocketPublisher";

const QUEUE_NAME = "transfer-websocket-events-trigger-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.doWebsocketServerWork && config.kafkaBrokers.length > 0) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { data } = job.data as EventInfo;

      try {
        const result = {
          token: {
            contract: data.address,
            tokenId: data.token_id,
          },
          from: data.from,
          to: data.to,
          amount: data.amount,
          block: data.block,
          txHash: data.tx_hash,
          logIndex: data.log_index,
          batchIndex: data.batch_index,
          timestamp: data.timestamp,
        };

        let eventType = "";
        if (data.trigger === "insert") eventType = "transfer.created";
        else if (data.trigger === "update") eventType = "transfer.updated";

        await publishWebsocketEvent({
          event: eventType,
          tags: {
            address: result.token.contract,
            from: result.from,
            to: result.to,
          },
          data: result,
          offset: data.offset,
        });
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Error processing websocket event. data=${JSON.stringify(data)}, error=${JSON.stringify(
            error
          )}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 80 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored. error=${JSON.stringify(error)}`);
  });
}

export type EventInfo = {
  data: TransferWebsocketEventInfo;
};

export const addToQueue = async (events: EventInfo[]) => {
  if (!config.doWebsocketServerWork) {
    return;
  }

  await queue.addBulk(
    _.map(events, (event) => ({
      name: randomUUID(),
      data: event,
    }))
  );
};

export type TransferWebsocketEventInfo = {
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

  trigger: "insert" | "update" | "delete";
  offset: string;
};
