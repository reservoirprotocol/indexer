import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { acquireLock, doesLockExist, releaseLock } from "@/common/redis";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";

export type NonFlaggedFloorQueueJobPayload = {
  kind: string;
  contract: string;
  tokenId: string;
  txHash: string | null;
  txTimestamp: number | null;
};

export default class NonFlaggedFloorQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "collection-updates-non-flagged-floor-ask-queue";
  maxRetries = 10;
  concurrency = 5;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  public async process(payload: NonFlaggedFloorQueueJobPayload) {
    // First, retrieve the token's associated collection.
    const collectionResult = await idb.oneOrNone(
      `
            SELECT
                tokens.collection_id,
                collections.community
            FROM tokens
            LEFT JOIN collections ON tokens.collection_id = collections.id
            WHERE tokens.contract = $/contract/
              AND tokens.token_id = $/tokenId/
          `,
      {
        contract: toBuffer(payload.contract),
        tokenId: payload.tokenId,
      }
    );

    if (!collectionResult?.collection_id) {
      // Skip if the token is not associated to a collection.
      return;
    }

    let acquiredLock;

    if (!["revalidation"].includes(payload.kind)) {
      acquiredLock = await acquireLock(
        `${this.queueName}-lock:${collectionResult.collection_id}`,
        300
      );

      if (!acquiredLock) {
        return;
      }
    }

    const nonFlaggedCollectionFloorAsk = await idb.oneOrNone(
      `
        WITH y AS (
          UPDATE collections SET
            non_flagged_floor_sell_id = x.floor_sell_id,
            non_flagged_floor_sell_value = x.floor_sell_value,
            non_flagged_floor_sell_maker = x.floor_sell_maker,
            non_flagged_floor_sell_source_id_int = x.source_id_int,
            non_flagged_floor_sell_valid_between = x.valid_between,
            updated_at = now()
          FROM (
            WITH collection_non_flagged_floor_sell AS (
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
                AND (tokens.is_flagged = 0 OR tokens.is_flagged IS NULL)
                ORDER BY tokens.floor_sell_value
                LIMIT 1
            )
            SELECT
                collection_non_flagged_floor_sell.floor_sell_id,
                collection_non_flagged_floor_sell.floor_sell_value,
                collection_non_flagged_floor_sell.floor_sell_maker,
                collection_non_flagged_floor_sell.source_id_int,
                collection_non_flagged_floor_sell.valid_between
            FROM collection_non_flagged_floor_sell
            UNION ALL
            SELECT NULL, NULL, NULL, NULL, NULL
            WHERE NOT EXISTS (SELECT 1 FROM collection_non_flagged_floor_sell)
          ) x
          WHERE collections.id = $/collection/
            AND (
              collections.non_flagged_floor_sell_id IS DISTINCT FROM x.floor_sell_id
              OR collections.non_flagged_floor_sell_value IS DISTINCT FROM x.floor_sell_value
            )
          RETURNING
            collections.non_flagged_floor_sell_id,
            collections.non_flagged_floor_sell_value,
            (
              SELECT
                collections.floor_sell_value
              FROM collections
              WHERE id = $/collection/
            ) AS old_non_flagged_floor_sell_value,
            collections.non_flagged_floor_sell_maker,
            collections.non_flagged_floor_sell_source_id_int,
            collections.non_flagged_floor_sell_valid_between
        )
        INSERT INTO collection_non_flagged_floor_sell_events(
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
          y.non_flagged_floor_sell_id,
          y.non_flagged_floor_sell_source_id_int,
          y.non_flagged_floor_sell_valid_between,
          y.non_flagged_floor_sell_maker,
          y.non_flagged_floor_sell_value,
          y.old_non_flagged_floor_sell_value,
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
          WHERE orders.id = y.non_flagged_floor_sell_id
          LIMIT 1
        ) z ON TRUE
        RETURNING
            contract,
            token_id
            
      `,
      {
        kind: payload.kind,
        collection: collectionResult.collection_id,
        txHash: payload.txHash ? toBuffer(payload.txHash) : null,
        txTimestamp: payload.txTimestamp,
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
          {
            kind: "revalidation",
            contract: payload.contract,
            tokenId: payload.tokenId,
            txHash: null,
            txTimestamp: null,
          },
        ]);
      }
    }

    if (nonFlaggedCollectionFloorAsk?.token_id) {
      await PendingFlagStatusSyncTokens.add(
        [
          {
            contract: payload.contract,
            tokenId: payload.tokenId,
          },
        ],
        true
      );
    }
  }

  public async addToQueue(params: NonFlaggedFloorQueueJobPayload[], delay = 0) {
    await this.sendBatch(params.map((info) => ({ payload: info, delay })));
  }
}

export const nonFlaggedFloorQueueJob = new NonFlaggedFloorQueueJob();
