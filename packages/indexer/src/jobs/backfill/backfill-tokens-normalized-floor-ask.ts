/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { orderUpdatesByIdJob } from "@/jobs/order-updates/order-updates-by-id-job";

const QUEUE_NAME = "backfill-tokens-normalized-floor-ask-queue";

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
      let cursor = job.data.cursor as CursorInfo;
      let continuationFilter = "";

      const limit = (await redis.get(`${QUEUE_NAME}-limit`)) || 1;

      if (!cursor) {
        const cursorJson = await redis.get(`${QUEUE_NAME}-next-cursor`);

        if (cursorJson) {
          cursor = JSON.parse(cursorJson);
        }
      }

      if (cursor) {
        continuationFilter = `AND (tokens.contract, tokens.token_id) > ($/contract/, $/tokenId/)`;
      }

      const tokens = await idb.manyOrNone(
        `
            SELECT
            tokens.contract,
            tokens.token_id,
            tokens.floor_sell_id
            FROM tokens
            WHERE tokens.floor_sell_id IS NOT NULL and tokens.normalized_floor_sell_id IS NULL
            ${continuationFilter}
            ORDER BY contract, token_id
            LIMIT $/limit/;
          `,
        {
          contract: cursor?.contract ? toBuffer(cursor?.contract) : null,
          tokenId: cursor?.tokenId,
          limit,
        }
      );

      let nextCursor;

      if (tokens.length > 0) {
        await orderUpdatesByIdJob.addToQueue(
          tokens.map(({ floor_sell_id }) => ({
            context: `backfill-normalized-floor-ask-${floor_sell_id}`,
            id: floor_sell_id,
            trigger: { kind: "bootstrap" },
          }))
        );

        if (tokens.length == limit) {
          const lastToken = _.last(tokens);

          nextCursor = {
            contract: fromBuffer(lastToken.contract),
            tokenId: lastToken.token_id,
          };

          await redis.set(`${QUEUE_NAME}-next-cursor`, JSON.stringify(nextCursor));

          await addToQueue(nextCursor);
        }
      }

      logger.info(
        QUEUE_NAME,
        `Processed ${tokens.length} tokens.  limit=${limit}, cursor=${JSON.stringify(
          cursor
        )}, nextCursor=${JSON.stringify(nextCursor)}`
      );
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type CursorInfo = {
  contract: string;
  tokenId: string;
};

export const addToQueue = async (cursor?: CursorInfo) => {
  await queue.add(randomUUID(), { cursor }, { delay: 1000 });
};
