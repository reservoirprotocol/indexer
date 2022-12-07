import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as collectionUpdatesNormalizedFloorAsk from "@/jobs/collection-updates/normalized-floor-queue";

const QUEUE_NAME = "token-updates-normalized-floor-ask-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
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
      const { kind, tokenSetId, txHash, txTimestamp } = job.data as FloorAskInfo;

      try {
        // Atomically update the cache and trigger an api event if needed
        const sellOrderResult = await idb.oneOrNone(
          `
                WITH z AS (
                  SELECT
                    x.contract,
                    x.token_id,
                    y.order_id,
                    y.value,
                    y.currency,
                    y.currency_value,
                    y.maker,
                    y.valid_between,
                    y.nonce,
                    y.source_id_int,
                    y.is_reservoir
                  FROM (
                    SELECT
                      token_sets_tokens.contract,
                      token_sets_tokens.token_id
                    FROM token_sets_tokens
                    WHERE token_sets_tokens.token_set_id = $/tokenSetId/
                  ) x LEFT JOIN LATERAL (
                    SELECT
                      orders.id AS order_id,
                      COALESCE(orders.normalized_value, orders."value") AS value,
                      orders.currency,
                      COALESCE(orders.currency_normalized_value, orders.currency_value) AS currency_value,
                      orders.maker,
                      orders.valid_between,
                      orders.source_id_int,
                      orders.nonce,
                      orders.is_reservoir
                    FROM orders
                    JOIN token_sets_tokens
                      ON orders.token_set_id = token_sets_tokens.token_set_id
                    WHERE token_sets_tokens.contract = x.contract
                      AND token_sets_tokens.token_id = x.token_id
                      AND orders.side = 'sell'
                      AND orders.fillability_status = 'fillable'
                      AND orders.approval_status = 'approved'
                      AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
                    ORDER BY COALESCE(orders.normalized_value, orders."value"), orders."value", orders.fee_bps
                    LIMIT 1
                  ) y ON TRUE
                ),
                w AS (
                  UPDATE tokens SET
                    normalized_floor_sell_id = z.order_id,
                    normalized_floor_sell_value = z.value,
                    normalized_floor_sell_currency = z.currency,
                    normalized_floor_sell_currency_value = z.currency_value,
                    normalized_floor_sell_maker = z.maker,
                    normalized_floor_sell_valid_from = least(
                      2147483647::NUMERIC,
                      date_part('epoch', lower(z.valid_between))
                    )::INT,
                    normalized_floor_sell_valid_to = least(
                      2147483647::NUMERIC,
                      coalesce(
                        nullif(date_part('epoch', upper(z.valid_between)), 'Infinity'),
                        0
                      )
                    )::INT,
                    normalized_floor_sell_source_id_int = z.source_id_int,
                    normalized_floor_sell_is_reservoir = z.is_reservoir,
                    updated_at = now()
                  FROM z
                  WHERE tokens.contract = z.contract
                    AND tokens.token_id = z.token_id
                    AND (
                      tokens.normalized_floor_sell_id IS DISTINCT FROM z.order_id
                      OR tokens.normalized_floor_sell_maker IS DISTINCT FROM z.maker
                      OR tokens.normalized_floor_sell_value IS DISTINCT FROM z.value
                    )
                  RETURNING
                    z.contract,
                    z.token_id,
                    z.order_id AS new_floor_sell_id,
                    z.maker AS new_floor_sell_maker,
                    z.value AS new_floor_sell_value,
                    z.valid_between AS new_floor_sell_valid_between,
                    z.nonce AS new_floor_sell_nonce,
                    z.source_id_int AS new_floor_sell_source_id_int,
                    (
                      SELECT tokens.normalized_floor_sell_value FROM tokens
                      WHERE tokens.contract = z.contract
                        AND tokens.token_id = z.token_id
                    ) AS old_floor_sell_value
                )
                INSERT INTO token_normalized_floor_sell_events(
                  kind,
                  contract,
                  token_id,
                  order_id,
                  maker,
                  price,
                  source_id_int,
                  valid_between,
                  nonce,
                  previous_price,
                  tx_hash,
                  tx_timestamp
                )
                SELECT
                  $/kind/ AS kind,
                  w.contract,
                  w.token_id,
                  w.new_floor_sell_id AS order_id,
                  w.new_floor_sell_maker AS maker,
                  w.new_floor_sell_value AS price,
                  w.new_floor_sell_source_id_int AS source_id_int,
                  w.new_floor_sell_valid_between AS valid_between,
                  w.new_floor_sell_nonce AS nonce,
                  w.old_floor_sell_value AS previous_price,
                  $/txHash/ AS tx_hash,
                  $/txTimestamp/ AS tx_timestamp
                FROM w
                RETURNING
                  kind,
                  contract,
                  token_id AS "tokenId",
                  price,
                  previous_price AS "previousPrice",
                  tx_hash AS "txHash",
                  tx_timestamp AS "txTimestamp"
              `,
          {
            tokenSetId,
            kind: kind,
            txHash: txHash ? toBuffer(txHash) : null,
            txTimestamp: txTimestamp || null,
          }
        );

        if (sellOrderResult) {
          sellOrderResult.contract = fromBuffer(sellOrderResult.contract);

          // Update collection floor
          sellOrderResult.txHash = sellOrderResult.txHash
            ? fromBuffer(sellOrderResult.txHash)
            : null;
          await collectionUpdatesNormalizedFloorAsk.addToQueue([sellOrderResult]);
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to process token normalized floor-ask info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type FloorAskInfo = {
  kind: string;
  tokenSetId: string;
  txHash: string | null;
  txTimestamp: number | null;
};

export const addToQueue = async (floorAskInfos: FloorAskInfo[]) => {
  await queue.addBulk(
    floorAskInfos.map((floorAskInfo) => ({
      name: `${floorAskInfo.tokenSetId}`,
      data: floorAskInfo,
    }))
  );
};
