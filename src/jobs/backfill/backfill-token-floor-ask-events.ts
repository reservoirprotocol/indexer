import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "token-floor-ask-events-backfill";

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
      const { id } = job.data as Info;

      try {
        if (Number(id) > (config.chainId === 1 ? 43818574 : 116212)) {
          return;
        }

        const results = await idb.manyOrNone(
          `
            WITH x AS (
              SELECT
                token_floor_sell_events.id,
                orders.source_id_int,
                orders.valid_between,
                orders.nonce
              FROM token_floor_sell_events
              LEFT JOIN orders
                ON token_floor_sell_events.order_id = orders.id
              WHERE token_floor_sell_events.id > $/id/
              ORDER BY token_floor_sell_events.id
              LIMIT 1000
            )
            UPDATE token_floor_sell_events SET
              source_id_int = x.source_id_int,
              valid_between = x.valid_between,
              nonce = x.nonce
            FROM x
            WHERE token_floor_sell_events.id = x.id
            RETURNING x.id
          `,
          { id }
        );

        if (results.length) {
          await addToQueue([{ id: Number(results[results.length - 1].id) }]);
        }
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

  // !!! DISABLED

  // redlock
  //   .acquire([`${QUEUE_NAME}-lock`], 60 * 60 * 24 * 30 * 1000)
  //   .then(async () => {
  //     await addToQueue([{ id: 0 }]);
  //   })
  //   .catch(() => {
  //     // Skip on any errors
  //   });
}

export type Info = {
  id: number;
};

export const addToQueue = async (infos: Info[]) => {
  await queue.addBulk(
    infos.map((info) => ({
      name: info.id.toString(),
      data: info,
    }))
  );
};
