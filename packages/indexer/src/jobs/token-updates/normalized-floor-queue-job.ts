import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { collectionNormalizedJob } from "@/jobs/collection-updates/collection-normalized-floor-queue-job";
import { FloorQueueJobPayload } from "@/jobs/token-updates/token-floor-queue-job";

export type NormalizedFloorQueueJobPayload = {
  kind: string;
  tokenSetId: string;
  txHash: string | null;
  txTimestamp: number | null;
};

export default class NormalizedFloorQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "token-updates-normalized-floor-ask-queue";
  maxRetries = 10;
  concurrency = 30;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process(payload: NormalizedFloorQueueJobPayload) {
    const { kind, tokenSetId, txHash, txTimestamp } = payload;

    try {
      // TODO: Right now we filter out Blur orders since those don't yet
      // support royalty normalization. A better approach to handling it
      // would be to set the normalized fields to `null` for every order
      // which doesn't support royalty normalization and then filter out
      // such `null` fields in various normalized events/caches.

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
                  AND orders.kind != 'blur'
                ORDER BY COALESCE(orders.normalized_value, orders.value), orders.value, orders.fee_bps, orders.id
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
            INSERT INTO token_normalized_floor_sell_events (
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
          kind,
          txHash: txHash ? toBuffer(txHash) : null,
          txTimestamp: txTimestamp || null,
        }
      );

      if (sellOrderResult) {
        sellOrderResult.contract = fromBuffer(sellOrderResult.contract);

        // Update collection floor
        sellOrderResult.txHash = sellOrderResult.txHash ? fromBuffer(sellOrderResult.txHash) : null;
        await collectionNormalizedJob.addToQueue([sellOrderResult]);

        if (kind === "revalidation") {
          logger.warn(this.queueName, `StaleCache: ${JSON.stringify(sellOrderResult)}`);
        }
      }
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to process token normalized floor-ask info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(params: FloorQueueJobPayload[]) {
    await this.sendBatch(
      params.map((info) => {
        return {
          payload: info,
          // jobId: info.kind !== "revalidation" ? info.tokenSetId : undefined,
        };
      })
    );
  }
}

export const normalizedFloorQueueJob = new NormalizedFloorQueueJob();
