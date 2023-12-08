import { idb, redb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { acquireLock, doesLockExist, redis, releaseLock } from "@/common/redis";
import { tokenRefreshCacheJob } from "@/jobs/token-updates/token-refresh-cache-job";
import { config } from "@/config/index";

export type CollectionFloorJobPayload = {
  kind: string;
  contract: string;
  tokenId: string;
  txHash: string | null;
  txTimestamp: number | null;
};

export class CollectionFloorJob extends AbstractRabbitMqJobHandler {
  queueName = "collection-updates-floor-ask-queue";
  maxRetries = 10;
  concurrency = config.chainId == 137 ? 1 : 5;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process(payload: CollectionFloorJobPayload) {
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

    if (!["revalidation"].includes(kind)) {
      acquiredLock = await acquireLock(
        `${this.queueName}-lock:${collectionResult.collection_id}`,
        300
      );

      if (!acquiredLock) {
        return;
      }
    }

    const collectionFloorAsk = await idb.oneOrNone(
      `
        WITH y AS (
          UPDATE collections SET
            floor_sell_id = x.floor_sell_id,
            floor_sell_value = x.floor_sell_value,
            floor_sell_maker = x.floor_sell_maker,
            floor_sell_source_id_int = x.source_id_int,
            floor_sell_valid_between = x.valid_between,
            updated_at = now()
          FROM (
            WITH collection_floor_sell AS (
                SELECT
                  tokens.floor_sell_id,
                  tokens.floor_sell_value,
                  tokens.floor_sell_maker,
                  orders.source_id_int,
                  orders.valid_between
                FROM tokens
                JOIN orders
                  ON tokens.floor_sell_id = orders.id
                WHERE tokens.collection_id = $/collection/
                ORDER BY tokens.floor_sell_value
                LIMIT 1
            )
            SELECT
                collection_floor_sell.floor_sell_id,
                collection_floor_sell.floor_sell_value,
                collection_floor_sell.floor_sell_maker,
                collection_floor_sell.source_id_int,
                collection_floor_sell.valid_between
            FROM collection_floor_sell
            UNION ALL
            SELECT NULL, NULL, NULL, NULL, NULL
            WHERE NOT EXISTS (SELECT 1 FROM collection_floor_sell)
          ) x
          WHERE collections.id = $/collection/
            AND (
              collections.floor_sell_id IS DISTINCT FROM x.floor_sell_id
              OR collections.floor_sell_value IS DISTINCT FROM x.floor_sell_value
            )
          RETURNING
            collections.floor_sell_id,
            collections.floor_sell_value,
            (
              SELECT
                collections.floor_sell_value
              FROM collections
              WHERE id = $/collection/
            ) AS old_floor_sell_value,
            collections.floor_sell_maker,
            collections.floor_sell_source_id_int,
            collections.floor_sell_valid_between
        )
        INSERT INTO collection_floor_sell_events(
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
          y.floor_sell_id,
          y.floor_sell_source_id_int,
          y.floor_sell_valid_between,
          y.floor_sell_maker,
          y.floor_sell_value,
          y.old_floor_sell_value,
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
          WHERE orders.id = y.floor_sell_id
          LIMIT 1
        ) z ON TRUE
        RETURNING order_id
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

      const revalidationLockExists = await doesLockExist(
        `${this.queueName}-revalidation-lock:${collectionResult.collection_id}`
      );

      if (revalidationLockExists) {
        await releaseLock(`${this.queueName}-revalidation-lock:${collectionResult.collection_id}`);

        await this.addToQueue([
          { kind: "revalidation", contract, tokenId, txHash: null, txTimestamp: null },
        ]);
      }
    }

    if (collectionFloorAsk) {
      await redis.del(`collection-floor-ask:${collectionResult.collection_id}`);

      const floorToken = await idb.oneOrNone(
        `
              SELECT
                tokens.contract,
                tokens.token_id
              FROM tokens
              WHERE tokens.collection_id = $/collection/
              ORDER BY tokens.floor_sell_value
              LIMIT 1
            `,
        {
          collection: collectionResult.collection_id,
        }
      );
      if (floorToken) {
        await tokenRefreshCacheJob.addToQueue({
          contract: fromBuffer(floorToken.contract),
          tokenId: floorToken.token_id,
        });
      }
    }
  }

  public async addToQueue(floorAskInfos: CollectionFloorJobPayload[], delay = 0) {
    await this.sendBatch(floorAskInfos.map((info) => ({ payload: info, delay })));
  }
}

export const collectionFloorJob = new CollectionFloorJob();
