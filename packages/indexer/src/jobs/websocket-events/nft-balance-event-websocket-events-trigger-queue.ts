import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { randomUUID } from "crypto";
import _ from "lodash";

import { formatEth } from "@/common/utils";

import { redisWebsocketPublisher } from "@/common/redis";

const QUEUE_NAME = "nft-balance-websocket-events-trigger-queue";

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
if (config.doBackgroundWork && config.doWebsocketServerWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { data } = job.data as EventInfo;

      try {
        const result = {
          token: {
            contract: data.contract,
            tokenId: data.token_id,
          },
          owner: data.owner,
          amount: data.amount,
          acquiredAt: data.acquired_at,
          floorSell: {
            id: data.floor_sell_id,
            value: data.floor_sell_value ? formatEth(data.floor_sell_value) : null,
          },
        };

        let eventType = "";
        if (data.trigger === "insert") eventType = "nft-balance.created";
        else if (data.trigger === "update") eventType = "nft-balance.updated";

        await redisWebsocketPublisher.publish(
          "events",
          JSON.stringify({
            event: eventType,
            tags: {
              contract: data.contract,
            },
            data: result,
          })
        );
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
  data: BalanceWebsocketEventInfo;
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

export type BalanceWebsocketEventInfo = {
  contract: string;
  token_id: string;
  owner: string;
  amount: string;
  acquired_at: string;
  floor_sell_id: string;
  floor_sell_value: string;
  top_buy_id: string;
  top_buy_value: string;
  top_buy_maker: string;
  last_token_appraisal_value: string;

  trigger: "insert" | "update" | "delete";
};
