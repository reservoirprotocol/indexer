import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { now, toBuffer } from "@/common/utils";
import { topBidsCache } from "@/models/top-bids-caching";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export type TopBidCollectionJobPayload = {
  kind: string;
  collectionId: string;
  txHash: string | null;
  txTimestamp: number | null;
};

export default class TopBidCollectionJob extends AbstractRabbitMqJobHandler {
  queueName = "collection-updates-top-bid-queue";
  maxRetries = 10;
  concurrency = 5;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  public async process(payload: TopBidCollectionJobPayload) {
    try {
      const collectionTopBid = await idb.oneOrNone(
        `
            WITH y AS (
              UPDATE collections SET
                top_buy_id = x.top_buy_id,
                top_buy_value = x.top_buy_value,
                top_buy_maker = x.top_buy_maker,
                top_buy_source_id_int = x.source_id_int,
                top_buy_valid_between = x.valid_between,
                updated_at = now()
              FROM (
                SELECT
                  collections.id AS collection_id,
                  y.*
                FROM collections
                LEFT JOIN LATERAL (
                  SELECT
                    token_sets.top_buy_id,
                    token_sets.top_buy_value,
                    token_sets.top_buy_maker,
                    orders.source_id_int,
                    orders.valid_between
                  FROM token_sets
                  JOIN orders
                    ON token_sets.top_buy_id = orders.id
                  WHERE token_sets.collection_id = collections.id
                  ORDER BY token_sets.top_buy_value DESC
                  LIMIT 1
                ) y ON TRUE
                WHERE collections.id = $/collectionId/
              ) x
              WHERE collections.id = $/collectionId/
                AND (
                  collections.top_buy_id IS DISTINCT FROM x.top_buy_id
                  OR collections.top_buy_value IS DISTINCT FROM x.top_buy_value
                )
              RETURNING
                collections.top_buy_id,
                collections.top_buy_value,
                (
                  SELECT
                    collections.top_buy_value
                  FROM collections
                  WHERE id = $/collectionId/
                ) AS old_top_buy_value,
                collections.top_buy_maker,
                collections.top_buy_source_id_int,
                collections.top_buy_valid_between
            )
            INSERT INTO collection_top_bid_events(
              kind,
              collection_id,
              contract,
              token_set_id,
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
              $/collectionId/,
              z.contract,
              z.token_set_id,
              y.top_buy_id,
              y.top_buy_source_id_int,
              y.top_buy_valid_between,
              y.top_buy_maker,
              y.top_buy_value,
              y.old_top_buy_value,
              $/txHash/,
              $/txTimestamp/
            FROM y
            LEFT JOIN LATERAL (
              SELECT
                orders.contract,
                orders.token_set_id
              FROM orders
              WHERE orders.id = y.top_buy_id
              LIMIT 1
            ) z ON TRUE
            RETURNING
              order_id,
              coalesce(
                nullif(date_part('epoch', upper(order_valid_between)), 'Infinity'),
                0
              ) AS valid_until,
              price AS top_buy_value,
              token_set_id
          `,
        {
          kind: payload.kind,
          collectionId: payload.collectionId,
          txHash: payload.txHash ? toBuffer(payload.txHash) : null,
          txTimestamp: payload.txTimestamp,
        }
      );

      try {
        if (collectionTopBid?.order_id) {
          // Cache the new top bid and set redis expiry as seconds until the top bid expires
          const expiryInSeconds = collectionTopBid?.valid_until - now();

          if (expiryInSeconds > 0) {
            await topBidsCache.cacheCollectionTopBidValue(
              payload.collectionId,
              Number(collectionTopBid?.top_buy_value.toString()),
              expiryInSeconds
            );
          }
        } else {
          // clear the cache
          await topBidsCache.clearCacheCollectionTopBidValue(payload.collectionId);
        }
      } catch (error) {
        logger.error(
          this.queueName,
          `Failed to cache collection top-bid value ${JSON.stringify(payload)}: ${error}`
        );
      }

      if (payload.kind === "new-order" && collectionTopBid?.order_id) {
        await WebsocketEventRouter({
          eventKind: WebsocketEventKind.NewTopBid,
          eventInfo: {
            orderId: collectionTopBid?.order_id,
          },
        });
      }
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to process collection top-bid info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(params: TopBidCollectionJobPayload[]) {
    await this.sendBatch(
      params.map((info) => {
        return {
          payload: info,
          jobId: info.kind !== "revalidation" ? info.collectionId : undefined,
        };
      })
    );
  }
}

export const topBidCollectionJob = new TopBidCollectionJob();
