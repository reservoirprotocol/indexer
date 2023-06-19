import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const QUEUE_NAME = "fill-updates";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { orderId, orderSide, contract, tokenId, amount, price, timestamp, maker, taker } =
        job.data as FillInfo;

      try {
        if (orderId) {
          const result = await idb.oneOrNone(
            `
              SELECT
                orders.token_set_id
              FROM orders
              WHERE orders.id = $/orderId/
            `,
            { orderId }
          );

          // If we can detect that the order was on a complex token set
          // (eg. not single token), then update the last buy caches of
          // that particular token set.
          if (result && result.token_set_id) {
            const components = result.token_set_id.split(":");
            if (components[0] !== "token") {
              await idb.none(
                `
                  UPDATE token_sets SET
                    last_buy_timestamp = $/timestamp/,
                    last_buy_value = $/price/
                  WHERE id = $/tokenSetId/
                    AND last_buy_timestamp < $/timestamp/
                `,
                {
                  tokenSetId: result.token_set_id,
                  timestamp,
                  price,
                }
              );
            }
          }
        }

        await idb.none(
          `
                UPDATE nft_balances SET
                  last_token_appraisal_value = $/price/
                WHERE contract = $/contract/
                AND token_id = $/tokenId/
                AND owner = $/owner/
              `,
          {
            contract: toBuffer(contract),
            tokenId,
            owner: orderSide === "sell" ? toBuffer(taker) : toBuffer(maker),
            price: bn(price).div(amount).toString(),
          }
        );

        await idb.none(
          `
            UPDATE tokens SET
              last_${orderSide}_timestamp = $/timestamp/,
              last_${orderSide}_value = $/price/,
              updated_at = now()
            WHERE contract = $/contract/
              AND token_id = $/tokenId/
              AND coalesce(last_${orderSide}_timestamp, 0) < $/timestamp/
          `,
          {
            contract: toBuffer(contract),
            tokenId,
            price: bn(price).div(amount).toString(),
            timestamp,
          }
        );
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle fill info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type FillInfo = {
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
  orderId?: string;
  orderSide: "buy" | "sell";
  contract: string;
  tokenId: string;
  amount: string;
  price: string;
  timestamp: number;
  maker: string;
  taker: string;
};

export const addToQueue = async (fillInfos: FillInfo[]) => {
  await queue.addBulk(
    fillInfos.map((fillInfo) => ({
      name: `${fillInfo.orderId}`,
      data: fillInfo,
      opts: {
        // We should make sure not to perform any expensive work more
        // than once. As such, we keep the last performed jobs in the
        // queue and give all jobs a deterministic id so that we skip
        // handling jobs that already got executed.
        jobId: fillInfo.context,
      },
    }))
  );
};
