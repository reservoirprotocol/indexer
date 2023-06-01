/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import _ from "lodash";
import { idb, ridb } from "@/common/db";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "@/jobs/websocket-events/websocket-event-router";
import { handleNewBuyOrderJob } from "@/jobs/update-attribute/handle-new-buy-order-job";
import * as collectionUpdatesTopBid from "@/jobs/collection-updates/top-bid-queue";
import { logger } from "@/common/logger";

export type topBidQueueJobPayload = {
  kind: string;
  tokenSetId: string;
  txHash: string | null;
  txTimestamp: number | null;
};

export class TopBidQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "token-set-updates-top-bid-queue";
  maxRetries = 10;
  concurrency = 20;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process(payload: topBidQueueJobPayload) {
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
            (result: { collection_id: any; attribute_id: any }) => ({
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
          //  Only trigger websocket event for non collection offers.
          await WebsocketEventRouter({
            eventKind: WebsocketEventKind.NewTopBid,
            eventInfo: {
              orderId: tokenSetTopBid[0].topBuyId,
            },
          });
        }

        for (const result of tokenSetTopBid) {
          if (!_.isNull(result.attributeId)) {
            await handleNewBuyOrderJob.addToQueue(result);
          }

          if (!_.isNull(result.collectionId)) {
            await collectionUpdatesTopBid.addToQueue([
              {
                collectionId: result.collectionId,
                kind: payload.kind,
                txHash: payload.txHash || null,
                txTimestamp: payload.txTimestamp || null,
              } as collectionUpdatesTopBid.TopBidInfo,
            ]);
          }
        }
      }
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to process token set top-bid info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(topBidInfos: topBidQueueJobPayload[]) {
    await this.sendBatch(topBidInfos.map((info) => ({ payload: info })));
  }
}

export const topBidQueueJob = new TopBidQueueJob();
