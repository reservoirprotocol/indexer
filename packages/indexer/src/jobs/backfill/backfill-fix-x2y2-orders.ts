import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { orderUpdatesByIdJob } from "@/jobs/order-updates/order-updates-by-id-job";

const QUEUE_NAME = "fix-x2y2-orders-backfill";

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
      const { maker, tokenSetId } = job.data as Info;

      try {
        const results = await redb.manyOrNone(
          `
            SELECT
              orders.maker,
              orders.token_set_id,
              count(*)
            FROM orders
            WHERE orders.kind = 'x2y2'
              AND orders.side = 'sell'
              AND (orders.maker, orders.token_set_id) > ($/maker/, $/tokenSetId/)
            GROUP BY orders.maker, orders.token_set_id
            ORDER BY orders.maker, orders.token_set_id
            LIMIT 100
          `,
          {
            maker: toBuffer(maker),
            tokenSetId,
          }
        );

        for (const { maker, token_set_id, count } of results) {
          if (Number(count) > 1) {
            const result = await redb.manyOrNone(
              `
                WITH x AS (
                  SELECT orders.id FROM orders
                  WHERE orders.kind = 'x2y2'
                    AND orders.side = 'sell'
                    AND orders.maker = $/maker/
                    AND orders.token_set_id = $/tokenSetId/
                  ORDER BY orders.created_at DESC NULLS LAST
                  OFFSET 1
                )
                UPDATE orders SET
                  fillability_status = 'cancelled'
                FROM x
                WHERE orders.id = x.id
                  AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
                RETURNING orders.id
              `,
              {
                maker,
                tokenSetId: token_set_id,
              }
            );

            await orderUpdatesByIdJob.addToQueue(
              result.map(({ id }) => ({
                context: `x2y2-order-fix-${id}`,
                id,
                trigger: { kind: "reprice" },
              }))
            );
          }
        }

        if (results.length) {
          const lastResult = results[results.length - 1];
          await addToQueue([
            {
              maker: fromBuffer(lastResult.maker),
              tokenSetId: lastResult.token_set_id,
            },
          ]);
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle fix X2Y2 info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate() }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type Info = {
  maker: string;
  tokenSetId: string;
};

export const addToQueue = async (infos: Info[]) => {
  await queue.addBulk(
    infos.map((info) => ({
      name: `${info.maker}-${info.tokenSetId}`,
      data: info,
    }))
  );
};
