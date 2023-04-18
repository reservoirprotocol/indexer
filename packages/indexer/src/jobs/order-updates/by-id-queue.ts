/* eslint-disable @typescript-eslint/no-explicit-any */

import { HashZero } from "@ethersproject/constants";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { TriggerKind } from "@/jobs/order-updates/types";

import * as buyOrderQueue from "@/jobs/order-updates/order-updates-buy-order";
import * as sellOrderQueue from "@/jobs/order-updates/order-updates-sell-order";

const QUEUE_NAME = "order-updates-by-id";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 60000,
  },
});
export let worker: Worker | undefined;

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { id } = job.data as OrderInfo;
      let { side, tokenSetId } = job.data as OrderInfo;

      try {
        let order: any;
        if (id) {
          // Fetch the order's associated data
          order = await idb.oneOrNone(
            `
              SELECT
                orders.id,
                orders.side,
                orders.token_set_id AS "tokenSetId",
                orders.source_id_int AS "sourceIdInt",
                orders.valid_between AS "validBetween",
                COALESCE(orders.quantity_remaining, 1) AS "quantityRemaining",
                orders.nonce,
                orders.maker,
                orders.price,
                orders.value,
                orders.fillability_status AS "fillabilityStatus",
                orders.approval_status AS "approvalStatus",
                orders.kind,
                orders.dynamic,
                orders.currency,
                orders.currency_price,
                orders.normalized_value,
                orders.currency_normalized_value,
                orders.raw_data,
                token_sets_tokens.contract,
                token_sets_tokens.token_id AS "tokenId"
              FROM orders
              JOIN token_sets_tokens
                ON orders.token_set_id = token_sets_tokens.token_set_id
              WHERE orders.id = $/id/
              LIMIT 1
            `,
            { id }
          );

          side = order?.side;
          tokenSetId = order?.tokenSetId;
        }

        if (side && tokenSetId) {
          job.data = { ...job.data, tokenSetId, side, order };
          if (side === "buy") {
            await buyOrderQueue.addToQueue([job.data]);
          }

          if (side === "sell") {
            await sellOrderQueue.addToQueue([job.data]);
          }
        }

        // handle triggering websocket events
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle order info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 50 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type OrderInfo = {
  // The context represents a deterministic id for what triggered
  // the job in the first place. Since this is what's going to be
  // set as the id of the job, the queue is only going to process
  // a context once (further jobs that have the same context will
  // be ignored - as long as the queue still holds past jobs with
  // the same context). It is VERY IMPORTANT to have this in mind
  // and set the contexts distinctive enough so that jobs are not
  // going to be wrongfully ignored. However, to be as performant
  // as possible it's also important to not have the contexts too
  // distinctive in order to avoid doing duplicative work.
  context: string;
  // Information regarding what triggered the job
  trigger: {
    kind: TriggerKind;
    txHash?: string;
    txTimestamp?: number;
    logIndex?: number;
    batchIndex?: number;
    blockHash?: string;
  };
  // When the order id is passed, we recompute the caches of any
  // tokens corresponding to the order (eg. order's token set).
  id?: string;
  // Otherwise we support updating token caches without passing an
  // explicit order so as to support cases like revalidation where
  // we don't have an order to check against.
  tokenSetId?: string;
  side?: "sell" | "buy";
};

export const addToQueue = async (orderInfos: OrderInfo[]) => {
  // Ignore empty orders
  orderInfos = orderInfos.filter(({ id }) => id !== HashZero);

  await queue.addBulk(
    orderInfos.map((orderInfo) => ({
      name: orderInfo.id ? orderInfo.id : orderInfo.tokenSetId! + "-" + orderInfo.side!,
      data: orderInfo,
      opts: {
        // We should make sure not to perform any expensive work more
        // than once. As such, we keep the last performed jobs in the
        // queue and give all jobs a deterministic id so that we skip
        // handling jobs that already got executed.
        jobId: orderInfo.context,
      },
    }))
  );
};
