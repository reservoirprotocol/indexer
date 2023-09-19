import { idb, redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import { acquireLock, doesLockExist, releaseLock } from "@/common/redis";
import { logger } from "@/common/logger";

export type CollectionNormalizedJobPayload = {
  kind: string;
  contract: string;
  tokenId: string;
  txHash: string | null;
  txTimestamp: number | null;
};

export class CollectionNormalizedJob extends AbstractRabbitMqJobHandler {
  queueName = "collection-updates-normalized-floor-ask-queue";
  maxRetries = 10;
  concurrency = config.chainId == 137 ? 1 : 5;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;
  lazyMode = true;

  protected async process(payload: CollectionNormalizedJobPayload) {
    const { kind, contract, tokenId, txHash, txTimestamp } = payload;

    // First, retrieve the token's associated collection.
    const collectionResult = await redb.oneOrNone(
      `
            SELECT tokens.collection_id FROM tokens
            WHERE tokens.contract = $/contract/
              AND tokens.token_id = $/tokenId/
          `,
      {
        contract: toBuffer(contract),
        tokenId,
      }
    );

    if (!collectionResult?.collection_id) {
      // Skip if the token is not associated to a collection.
      return;
    }

    let acquiredLock;

    if ([5, 11155111].includes(config.chainId)) {
      if (!["revalidation"].includes(kind)) {
        acquiredLock = await acquireLock(
          `${this.queueName}-lock:${collectionResult.collection_id}`,
          300
        );

        if (!acquiredLock) {
          const acquiredRevalidationLock = await acquireLock(
            `${this.queueName}-revalidation-lock:${collectionResult.collection_id}`,
            300
          );

          if (acquiredRevalidationLock) {
            logger.info(
              this.queueName,
              JSON.stringify({
                message: `Got revalidation lock. kind=${kind}, collection=${collectionResult.collection_id}, tokenId=${tokenId}`,
                payload,
                collectionId: collectionResult.collection_id,
              })
            );
          }

          return;
        }
      }

      logger.info(
        this.queueName,
        JSON.stringify({
          message: `Recalculating floor ask. kind=${kind}, collection=${collectionResult.collection_id}, tokenId=${tokenId}`,
          payload,
          collectionId: collectionResult.collection_id,
        })
      );
    }

    await idb.none(
      `
        WITH y AS (
          UPDATE collections SET
            normalized_floor_sell_id = x.normalized_floor_sell_id,
            normalized_floor_sell_value = x.normalized_floor_sell_value,
            normalized_floor_sell_maker = x.normalized_floor_sell_maker,
            normalized_floor_sell_source_id_int = x.source_id_int,
            normalized_floor_sell_valid_between = x.valid_between,
            updated_at = now()
          FROM (
            WITH collection_normalized_floor_sell AS (
                SELECT
                  tokens.normalized_floor_sell_id,
                  tokens.normalized_floor_sell_value,
                  tokens.normalized_floor_sell_maker,
                  orders.source_id_int,
                  orders.valid_between
                FROM tokens
                JOIN orders ON tokens.normalized_floor_sell_id = orders.id
                WHERE tokens.collection_id = $/collection/
                ORDER BY tokens.normalized_floor_sell_value
                LIMIT 1
            )
            SELECT
                collection_normalized_floor_sell.normalized_floor_sell_id,
                collection_normalized_floor_sell.normalized_floor_sell_value,
                collection_normalized_floor_sell.normalized_floor_sell_maker,
                collection_normalized_floor_sell.source_id_int,
                collection_normalized_floor_sell.valid_between
            FROM collection_normalized_floor_sell
            UNION ALL
            SELECT NULL, NULL, NULL, NULL, NULL
            WHERE NOT EXISTS (SELECT 1 FROM collection_normalized_floor_sell)
          ) x
          WHERE collections.id = $/collection/
            AND (
              collections.normalized_floor_sell_id IS DISTINCT FROM x.normalized_floor_sell_id
              OR collections.normalized_floor_sell_value IS DISTINCT FROM x.normalized_floor_sell_value
            )
          RETURNING
            collections.normalized_floor_sell_id,
            collections.normalized_floor_sell_value,
            (
              SELECT
                collections.normalized_floor_sell_value
              FROM collections
              WHERE id = $/collection/
            ) AS old_normalized_floor_sell_value,
            collections.normalized_floor_sell_maker,
            collections.normalized_floor_sell_source_id_int,
            collections.normalized_floor_sell_valid_between
        )
        INSERT INTO collection_normalized_floor_sell_events(
          kind,
          collection_id,
          contract,
          token_id,
          order_id,
          order_source_id_int,
          order_valid_between,
          maker,
          price,
          previous_price,
          tx_hash,
          tx_timestamp
        )
        SELECT
          $/kind/::token_floor_sell_event_kind_t,
          $/collection/,
          z.contract,
          z.token_id,
          y.normalized_floor_sell_id,
          y.normalized_floor_sell_source_id_int,
          y.normalized_floor_sell_valid_between,
          y.normalized_floor_sell_maker,
          y.normalized_floor_sell_value,
          y.old_normalized_floor_sell_value,
          $/txHash/,
          $/txTimestamp/
        FROM y
        LEFT JOIN LATERAL (
          SELECT
            token_sets_tokens.contract,
            token_sets_tokens.token_id
          FROM token_sets_tokens
          JOIN orders
            ON token_sets_tokens.token_set_id = orders.token_set_id
          WHERE orders.id = y.normalized_floor_sell_id
          LIMIT 1
        ) z ON TRUE
      `,
      {
        kind,
        collection: collectionResult.collection_id,
        contract: toBuffer(contract),
        tokenId,
        txHash: txHash ? toBuffer(txHash) : null,
        txTimestamp,
      }
    );

    if (acquiredLock) {
      await releaseLock(`${this.queueName}-lock:${collectionResult.collection_id}`);

      logger.info(
        this.queueName,
        JSON.stringify({
          message: `Released lock. kind=${kind}, collection=${collectionResult.collection_id}, tokenId=${tokenId}`,
          payload,
          collectionId: collectionResult.collection_id,
        })
      );

      const revalidationLockExists = await doesLockExist(
        `${this.queueName}-revalidation-lock:${collectionResult.collection_id}`
      );

      if (revalidationLockExists) {
        await releaseLock(`${this.queueName}-revalidation-lock:${collectionResult.collection_id}`);

        logger.info(
          this.queueName,
          JSON.stringify({
            message: `Trigger revalidation. kind=${kind}, collection=${collectionResult.collection_id}, tokenId=${tokenId}`,
            payload,
            collectionId: collectionResult.collection_id,
          })
        );

        await this.addToQueue([
          { kind: "revalidation", contract, tokenId, txHash: null, txTimestamp: null },
        ]);
      }
    }
  }

  public async addToQueue(params: CollectionNormalizedJobPayload[], delay = 0) {
    await this.sendBatch(
      params.map((info) => ({
        payload: info,
        delay,
        jobId: `${info.kind}${info.contract}${info.tokenId}${info.txHash}${info.txTimestamp}`,
      }))
    );
  }
}

export const collectionNormalizedJob = new CollectionNormalizedJob();
