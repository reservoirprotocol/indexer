import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { fromBuffer, toBuffer } from "@/common/utils";

const QUEUE_NAME = "top-bid-update-queue";

export const bidUpdateBatchSize = 200;

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { tokenSetId, contract, tokenId } = job.data;

      let continuationFilter = "";
      if (contract && tokenId) {
        continuationFilter = `AND (contract, token_id) > ($/contract/, $/tokenId/)`;
      }

      const query = `
        WITH "z" AS (
          SELECT "x"."contract", "x"."token_id", "y"."order_id", "y"."value", "y"."maker"
          FROM (
            SELECT "tst"."contract", "tst"."token_id"
            FROM "token_sets_tokens" "tst"
            WHERE "token_set_id" = $/tokenSetId/
            ${continuationFilter}
            ORDER BY contract, token_id ASC
            LIMIT ${bidUpdateBatchSize}
          ) "x" LEFT JOIN LATERAL (
            SELECT
              "o"."id" as "order_id",
              "o"."value",
              "o"."maker"
            FROM "orders" "o"
            JOIN "token_sets_tokens" "tst"
              ON "o"."token_set_id" = "tst"."token_set_id"
            WHERE "tst"."contract" = "x"."contract"
              AND "tst"."token_id" = "x"."token_id"
              AND "o"."side" = 'buy'
              AND "o"."fillability_status" = 'fillable'
              AND "o"."approval_status" = 'approved'
              AND EXISTS(
                SELECT FROM "nft_balances" "nb"
                  WHERE "nb"."contract" = "x"."contract"
                  AND "nb"."token_id" = "x"."token_id"
                  AND "nb"."amount" > 0
                  AND "nb"."owner" != "o"."maker"
              )
            ORDER BY "o"."value" DESC
            LIMIT 1
          ) "y" ON TRUE
        ), y AS (
          UPDATE "tokens" AS "t"
          SET "top_buy_id" = "z"."order_id",
              "top_buy_value" = "z"."value",
              "top_buy_maker" = "z"."maker",
              "updated_at" = now()
          FROM "z"
          WHERE "t"."contract" = "z"."contract"
          AND "t"."token_id" = "z"."token_id"
          AND "t"."top_buy_id" IS DISTINCT FROM "z"."order_id"
        )
        
        SELECT contract, token_id
        FROM z
        ORDER BY contract, token_id DESC
        LIMIT 1
      `;

      const result = await idb.oneOrNone(query, {
        tokenSetId,
        contract: contract ? toBuffer(contract) : "",
        tokenId,
      });

      if (!tokenSetId.startsWith("token:") && result) {
        await addToQueue(tokenSetId, fromBuffer(result.contract), result.token_id);
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  tokenSetId: string,
  contract: string | null = null,
  tokenId: string | null = null
) => {
  await queue.add(randomUUID(), { tokenSetId, contract, tokenId });
};
