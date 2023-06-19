import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import { topBidsCache } from "@/models/top-bids-caching";

const QUEUE_NAME = "collection-updates-top-bid-queue";

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
      const { kind, collectionId, txHash, txTimestamp } = job.data as TopBidInfo;

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
            kind,
            collectionId,
            txHash: txHash ? toBuffer(txHash) : null,
            txTimestamp,
          }
        );

        try {
          if (collectionTopBid?.order_id) {
            // Cache the new top bid and set redis expiry as seconds until the top bid expires
            const expiryInSeconds = collectionTopBid?.valid_until - now();

            if (expiryInSeconds > 0) {
              await topBidsCache.cacheCollectionTopBidValue(
                collectionId,
                Number(collectionTopBid?.top_buy_value.toString()),
                expiryInSeconds
              );
            }
          } else {
            // clear the cache
            await topBidsCache.clearCacheCollectionTopBidValue(collectionId);
          }
        } catch (error) {
          logger.error(
            QUEUE_NAME,
            `Failed to cache collection top-bid value ${JSON.stringify(job.data)}: ${error}`
          );
        }

        if (kind === "new-order" && collectionTopBid?.order_id) {
          await WebsocketEventRouter({
            eventKind: WebsocketEventKind.NewTopBid,
            eventInfo: { orderId: collectionTopBid?.order_id },
          });
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to process collection top-bid info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type TopBidInfo = {
  kind: string;
  collectionId: string;
  txHash: string | null;
  txTimestamp: number | null;
};

export const addToQueue = async (topBidInfos: TopBidInfo[]) => {
  await queue.addBulk(
    topBidInfos.map((topBidInfos) => ({
      name: `${topBidInfos.collectionId}`,
      data: topBidInfos,
    }))
  );
};
