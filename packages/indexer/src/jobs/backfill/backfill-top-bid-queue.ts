/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "nft-balance-updates-backfill-top-bid-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const cursor = job.data.cursor as CursorInfo;

      const limit = 1;
      let continuationFilter = "";

      if (cursor) {
        continuationFilter = `AND token_set_id > '${cursor.tokenSetId}'`;
      }

      const buyOrders = await idb.manyOrNone(
        `
              SELECT DISTINCT o.token_set_id
              FROM orders o 
              WHERE o.side = 'buy'
              AND o.fillability_status = 'fillable'
              AND o.approval_status = 'approved'
              ${continuationFilter}
              LIMIT ${limit};
          `
      );

      if (buyOrders?.length > 0) {
        await idb.none(
          `
                    WITH z AS (
                        SELECT 
                            x.contract,
                            x.token_id,
                            x.owner,
                            y.id as top_buy_id,
                            y.value as top_buy_value,
                            y.maker as top_buy_maker
                        FROM (
                            SELECT
                                nb.contract,
                                nb.token_id,
                                nb.owner,
                                nb.amount
                            FROM token_sets_tokens tst
                            JOIN nft_balances nb
                              ON tst.contract = nb.contract 
                              AND tst.token_id = nb.token_id 
                            WHERE tst.token_set_id IN ($/tokenSetIds/)
                          ) x
                        LEFT JOIN LATERAL(
                            SELECT
                                o.id,
                                o.value,
                                o.maker
                            FROM orders o 
                            JOIN token_sets_tokens tst
                            ON o.token_set_id = tst.token_set_id
                            WHERE tst.contract = x.contract
                            AND tst.token_id = x.token_id
                            AND o.side = 'buy'
                            AND o.fillability_status = 'fillable'
                            AND o.approval_status = 'approved'
                            AND x.amount > 0
                            AND x.owner != o.maker
                            ORDER BY o.value DESC
                            LIMIT 1
                        ) y ON TRUE
                    )
                    UPDATE nft_balances AS nb
                    SET top_buy_id = z.top_buy_id,
                        top_buy_value = z.top_buy_value,
                        top_buy_maker = z.top_buy_maker
                    FROM z
                    WHERE nb.contract = z.contract
                    AND nb.token_id = z.token_id
                    AND nb.owner = z.owner
                    AND nb.top_buy_id IS DISTINCT FROM z.top_buy_id
          `,
          {
            tokenSetIds: buyOrders.map((o) => o.token_set_id).join(","),
          }
        );

        if (_.size(buyOrders) == limit) {
          const lastBuyOrder = _.last(buyOrders);

          const nextCursor = {
            tokenSetId: lastBuyOrder.token_set_id,
          };

          logger.info(
            QUEUE_NAME,
            `Iterated ${limit} records.  nextCursor=${JSON.stringify(nextCursor)}`
          );

          await addToQueue(nextCursor);
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type CursorInfo = {
  tokenSetId: string;
};

export const addToQueue = async (cursor?: CursorInfo) => {
  await queue.add(randomUUID(), { cursor });
};
