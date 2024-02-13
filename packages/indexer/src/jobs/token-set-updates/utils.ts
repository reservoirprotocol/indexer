import _ from "lodash";

import { idb, ridb } from "@/common/db";
import { logger } from "@/common/logger";
import {
  topBidCollectionJob,
  TopBidCollectionJobPayload,
} from "@/jobs/collection-updates/top-bid-collection-job";
import { handleNewBuyOrderJob } from "@/jobs/update-attribute/handle-new-buy-order-job";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";

export type topBidPayload = {
  kind: string;
  tokenSetId: string;
  txHash: string | null;
  txTimestamp: number | null;
};

export async function processTopBid(payload: topBidPayload, queueName: string) {
  try {
    let tokenSetTopBid = await idb.manyOrNone(
      `
        WITH x AS (
          SELECT
            token_sets.id AS token_set_id,
            y.*
          FROM token_sets
          LEFT JOIN LATERAL (
            SELECT
              orders.id AS order_id,
              orders.value,
              orders.maker
            FROM orders
            WHERE orders.token_set_id = token_sets.id
              AND orders.side = 'buy'
              AND orders.fillability_status = 'fillable'
              AND orders.approval_status = 'approved'
              AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
            ORDER BY orders.value DESC
            LIMIT 1
          ) y ON TRUE
          WHERE token_sets.id = $/tokenSetId/
        )
        UPDATE token_sets SET
          top_buy_id = x.order_id,
          top_buy_value = x.value,
          top_buy_maker = x.maker,
          attribute_id = token_sets.attribute_id,
          collection_id = token_sets.collection_id
        FROM x
        WHERE token_sets.id = x.token_set_id
          AND (
            token_sets.top_buy_id IS DISTINCT FROM x.order_id
            OR token_sets.top_buy_value IS DISTINCT FROM x.value
          )
        RETURNING
          collection_id AS "collectionId",
          attribute_id AS "attributeId",
          top_buy_value AS "topBuyValue",
          top_buy_id AS "topBuyId"
      `,
      { tokenSetId: payload.tokenSetId }
    );

    if (!tokenSetTopBid.length && payload.kind === "revalidation") {
      // When revalidating, force revalidation of the attribute / collection
      const tokenSetsResult = await ridb.manyOrNone(
        `
          SELECT
            token_sets.collection_id,
            token_sets.attribute_id
          FROM token_sets
          WHERE token_sets.id = $/tokenSetId/
        `,
        {
          tokenSetId: payload.tokenSetId,
        }
      );
      if (tokenSetsResult.length) {
        tokenSetTopBid = tokenSetsResult.map(
          (result: { collection_id: string; attribute_id: number }) => ({
            kind: payload.kind,
            collectionId: result.collection_id,
            attributeId: result.attribute_id,
            txHash: payload.txHash || null,
            txTimestamp: payload.txTimestamp || null,
          })
        );
      }
    }

    if (tokenSetTopBid.length) {
      if (
        payload.kind === "new-order" &&
        tokenSetTopBid[0].topBuyId &&
        _.isNull(tokenSetTopBid[0].collectionId)
      ) {
        await WebsocketEventRouter({
          eventKind: WebsocketEventKind.NewTopBid,
          eventInfo: {
            orderId: tokenSetTopBid[0].topBuyId,
            validateCollectionTopBid: true,
          },
        });
      }
      for (const result of tokenSetTopBid) {
        if (!_.isNull(result.attributeId)) {
          await handleNewBuyOrderJob.addToQueue(result);
        }
        if (!_.isNull(result.collectionId)) {
          await topBidCollectionJob.addToQueue([
            {
              collectionId: result.collectionId,
              kind: payload.kind,
              txHash: payload.txHash || null,
              txTimestamp: payload.txTimestamp || null,
            } as TopBidCollectionJobPayload,
          ]);
        }
      }
    }
  } catch (error) {
    logger.error(
      queueName,
      `Failed to process token set top-bid info ${JSON.stringify(payload)}: ${error}`
    );
    throw error;
  }
}
