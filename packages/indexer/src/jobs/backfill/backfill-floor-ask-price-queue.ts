/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { nftBalanceUpdateFloorAskJob } from "@/jobs/nft-balance-updates/update-floor-ask-price-job";

const QUEUE_NAME = "nft-balance-updates-backfill-floor-ask-price-queue";

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

      const limit = (await redis.get(`${QUEUE_NAME}-limit`)) || 200;

      if (!cursor) {
        const cursorJson = await redis.get(`${QUEUE_NAME}-next-cursor`);

        if (cursorJson) {
          cursor = JSON.parse(cursorJson);
        }
      }

      if (cursor) {
        continuationFilter = `AND (o.created_at, o.id) < (to_timestamp($/createdAt/), $/id/)`;
      }

      const sellOrders = await idb.manyOrNone(
        `
          SELECT
            o.id,
            o.maker,
            o.token_set_id,
            extract(epoch from o.created_at) created_at
          FROM orders o 
          WHERE o.side = 'sell'
          AND o.fillability_status = 'fillable'
          AND o.approval_status = 'approved'
          ${continuationFilter}
          ORDER BY o.created_at DESC, o.id DESC
          LIMIT $/limit/;
          `,
        {
          createdAt: cursor?.createdAt,
          id: cursor?.id,
          limit,
        }
      );

      if (sellOrders.length > 0) {
        const updateFloorAskPriceInfos = [];

        for (const sellOrder of sellOrders) {
          const [, contract, tokenId] = sellOrder.token_set_id.split(":");

          updateFloorAskPriceInfos.push({
            contract: contract,
            tokenId: tokenId,
            owner: fromBuffer(sellOrder.maker),
          });
        }

        await nftBalanceUpdateFloorAskJob.addToQueue(updateFloorAskPriceInfos);

        if (sellOrders.length == limit) {
          const lastSellOrder = _.last(sellOrders);

          const nextCursor = {
            id: lastSellOrder.id,
            createdAt: lastSellOrder.created_at,
          };

          await redis.set(`${QUEUE_NAME}-next-cursor`, JSON.stringify(nextCursor));

          await addToQueue(nextCursor);
        }
      }

      logger.info(
        QUEUE_NAME,
        `Processed ${sellOrders.length} sell orders.  limit=${limit}, cursor=${JSON.stringify(
          cursor
        )}`
      );
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type CursorInfo = {
  id: string;
  createdAt: string;
};

export const addToQueue = async (cursor?: CursorInfo) => {
  await queue.add(randomUUID(), { cursor }, { delay: 2000 });
};
