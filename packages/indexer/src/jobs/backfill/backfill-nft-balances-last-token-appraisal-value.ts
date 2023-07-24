/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-nft-balances-last-token-appraisal-value-queue";

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

      if (cursor) {
        continuationFilter = `AND (nft_balances.owner, nft_balances.contract, nft_balances.token_id) > ($/owner/, $/contract/, $/tokenId/)`;
      }

      try {
        const tokens = await idb.manyOrNone(
          `
            WITH x AS (
                        SELECT
                          nft_balances.contract,
                          nft_balances.token_id,
                          nft_balances.owner,
                          y.price
                        FROM nft_balances
                        LEFT JOIN LATERAL(
                            SELECT fill_events_2.price
                            FROM fill_events_2
                            WHERE fill_events_2.contract = nft_balances.contract
                            AND fill_events_2.token_id = nft_balances.token_id
                            ORDER BY fill_events_2.timestamp DESC
                            LIMIT 1
                        ) y ON TRUE
                        WHERE nft_balances.amount > 0
                        ${continuationFilter}
                        ORDER BY nft_balances.owner, nft_balances.contract, nft_balances.token_id
                        LIMIT $/limit/
                    )
                    UPDATE nft_balances AS nb
                    SET
                        last_token_appraisal_value = x.price
                    FROM x
                    WHERE nb.contract = x.contract
                    AND nb.token_id = x.token_id
                    AND nb.owner = x.owner
                    RETURNING nb.owner, nb.contract, nb.token_id;
          `,
          {
            owner: cursor?.owner ? toBuffer(cursor?.owner) : null,
            contract: cursor?.contract ? toBuffer(cursor?.contract) : null,
            tokenId: cursor?.tokenId,
            limit,
          }
        );

        job.data.nextCursor = null;

        if (tokens.length == limit) {
          const lastToken = _.last(tokens);

          job.data.nextCursor = {
            owner: fromBuffer(lastToken.owner),
            contract: fromBuffer(lastToken.contract),
            tokenId: lastToken.token_id,
          };
        }

        logger.info(
          QUEUE_NAME,
          `Processed ${tokens.length} records.  limit=${limit}, cursor=${JSON.stringify(
            cursor
          )}, nextCursor=${JSON.stringify(job.data.nextCursor)}`
        );
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Process error.  limit=${limit}, cursor=${JSON.stringify(cursor)}, error=${JSON.stringify(
            error
          )}`
        );

        job.data.nextCursor = cursor;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("completed", async (job) => {
    if (job.data.nextCursor) {
      await addToQueue(job.data.nextCursor);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type CursorInfo = {
  owner: string;
  contract: string;
  tokenId: string;
};

export const addToQueue = async (cursor?: CursorInfo) => {
  await queue.add(randomUUID(), { cursor });
};
