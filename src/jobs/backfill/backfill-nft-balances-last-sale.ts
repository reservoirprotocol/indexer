/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-nft-balances-last-sale-queue";

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
      let continuationFilter = "";

      const limit = (await redis.get(`${QUEUE_NAME}-limit`)) || 1;
      const owner =
        (await redis.get(`${QUEUE_NAME}-owner`)) || "0xf0d6999725115e3ead3d927eb3329d63afaec09b";

      if (cursor) {
        continuationFilter = `AND (nft_balances.contract, nft_balances.token_id) > ($/contract/, $/tokenId/)`;
      }

      const tokens = await idb.manyOrNone(
        `
            WITH x AS (
                        SELECT
                          nft_balances.contract,
                          nft_balances.token_id,
                          nft_balances.owner,
                          y.timestamp,
                          y.price
                        FROM nft_balances
                        LEFT JOIN LATERAL(
                            SELECT fill_events_2."timestamp", fill_events_2.price
                            FROM fill_events_2
                            WHERE fill_events_2.contract = nft_balances.contract
                            AND fill_events_2.token_id = nft_balances.token_id
                            ORDER BY fill_events_2.timestamp DESC
                            LIMIT 1
                        ) y ON TRUE
                        WHERE nft_balances.owner = $/owner/
                        AND nft_balances.amount > 0
                        ${continuationFilter}
                        ORDER BY nft_balances.contract, nft_balances.token_id
                        LIMIT $/limit/
                    )
                    UPDATE nft_balances AS nb
                    SET
                        last_sale_value = x.price,
                        last_sale_timestamp = x.timestamp
                    FROM x
                    WHERE nb.contract = x.contract
                    AND nb.token_id = x.token_id
                    AND nb.owner = x.owner
                    RETURNING nb.contract, nb.token_id;
          `,
        {
          owner: toBuffer(owner),
          contract: cursor?.contract ? toBuffer(cursor?.contract) : null,
          tokenId: cursor?.tokenId,
          limit,
        }
      );

      let nextCursor;

      if (tokens.length == limit) {
        const lastToken = _.last(tokens);

        nextCursor = {
          contract: fromBuffer(lastToken.contract),
          tokenId: lastToken.token_id,
        };

        await addToQueue(nextCursor);
      }

      logger.info(
        QUEUE_NAME,
        `Processed ${tokens.length} records.  limit=${limit}, cursor=${JSON.stringify(
          cursor
        )}, nextCursor=${JSON.stringify(nextCursor)}`
      );
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire([`${QUEUE_NAME}-lock`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await addToQueue();
    })
    .catch(() => {
      // Skip on any errors
    });
}

export type CursorInfo = {
  contract: string;
  tokenId: string;
};

export const addToQueue = async (cursor?: CursorInfo) => {
  await queue.add(randomUUID(), { cursor }, { delay: 1000 });
};
