/* eslint-disable @typescript-eslint/no-explicit-any */

import { HashZero } from "@ethersproject/constants";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import _ from "lodash";

import { idb, ridb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { TriggerKind } from "@/jobs/order-updates/types";

import * as processActivityEvent from "@/jobs/activities/process-activity-event";
import * as collectionUpdatesTopBid from "@/jobs/collection-updates/top-bid-queue";
import * as handleNewBuyOrder from "@/jobs/update-attribute/handle-new-buy-order";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "../websocket-events/websocket-event-router";
// import { handleNewBuyOrderJob } from "@/jobs/update-attribute/handle-new-buy-order-job";

const QUEUE_NAME = "order-updates-buy-order";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 60000,
  },
});
export let worker: Worker | undefined;

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { id, trigger, tokenSetId, order } = job.data as OrderInfo;

      try {
        if (!tokenSetId) {
          logger.error(QUEUE_NAME, `No token set ID found for orderId=${id}, ${job.data}`);
          return;
        }

        if (!tokenSetId.startsWith("token")) {
          let buyOrderResult = await idb.manyOrNone(
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
            { tokenSetId }
          );

          if (!buyOrderResult.length && trigger.kind === "revalidation") {
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
                tokenSetId,
              }
            );

            if (tokenSetsResult.length) {
              buyOrderResult = tokenSetsResult.map(
                (result: { collection_id: any; attribute_id: any }) => ({
                  kind: trigger.kind,
                  collectionId: result.collection_id,
                  attributeId: result.attribute_id,
                  txHash: trigger.txHash || null,
                  txTimestamp: trigger.txTimestamp || null,
                })
              );
            }
          }

          if (buyOrderResult.length) {
            if (
              trigger.kind === "new-order" &&
              buyOrderResult[0].topBuyId &&
              buyOrderResult[0].attributeId
            ) {
              await WebsocketEventRouter({
                eventKind: WebsocketEventKind.NewTopBid,
                eventInfo: {
                  orderId: buyOrderResult[0].topBuyId,
                },
              });
            }

            for (const result of buyOrderResult) {
              if (!_.isNull(result.attributeId)) {
                await handleNewBuyOrder.addToQueue(result);
              }

              if (!_.isNull(result.collectionId) && !tokenSetId.startsWith("token")) {
                await collectionUpdatesTopBid.addToQueue([
                  {
                    collectionId: result.collectionId,
                    kind: trigger.kind,
                    txHash: trigger.txHash || null,
                    txTimestamp: trigger.txTimestamp || null,
                  } as collectionUpdatesTopBid.TopBidInfo,
                ]);
              }
            }
          }
        }

        if (order) {
          order.contract = toBuffer(order.contract);
          order.maker = toBuffer(order.maker);
          order.currency = toBuffer(order.currency);
          if (order.side === "buy") {
            // Insert a corresponding bid event
            await idb.none(
              `
                  INSERT INTO bid_events (
                    kind,
                    status,
                    contract,
                    token_set_id,
                    order_id,
                    order_source_id_int,
                    order_valid_between,
                    order_quantity_remaining,
                    order_nonce,
                    maker,
                    price,
                    value,
                    tx_hash,
                    tx_timestamp,
                    order_kind,
                    order_currency,
                    order_currency_price,
                    order_normalized_value,
                    order_currency_normalized_value,
                    order_raw_data
                  )
                  VALUES (
                    $/kind/,
                    (
                      CASE
                        WHEN $/fillabilityStatus/ = 'filled' THEN 'filled'
                        WHEN $/fillabilityStatus/ = 'cancelled' THEN 'cancelled'
                        WHEN $/fillabilityStatus/ = 'expired' THEN 'expired'
                        WHEN $/fillabilityStatus/ = 'no-balance' THEN 'inactive'
                        WHEN $/approvalStatus/ = 'no-approval' THEN 'inactive'
                        ELSE 'active'
                      END
                    )::order_event_status_t,
                    $/contract/,
                    $/tokenSetId/,
                    $/orderId/,
                    $/orderSourceIdInt/,
                    $/validBetween/,
                    $/quantityRemaining/,
                    $/nonce/,
                    $/maker/,
                    $/price/,
                    $/value/,
                    $/txHash/,
                    $/txTimestamp/,
                    $/orderKind/,
                    $/orderCurrency/,
                    $/orderCurrencyPrice/,
                    $/orderNormalizedValue/,
                    $/orderCurrencyNormalizedValue/,
                    $/orderRawData/
                  )
                `,
              {
                fillabilityStatus: order.fillabilityStatus,
                approvalStatus: order.approvalStatus,
                contract: order.contract,
                tokenSetId: order.tokenSetId,
                orderId: order.id,
                orderSourceIdInt: order.sourceIdInt,
                validBetween: order.validBetween,
                quantityRemaining: order.quantityRemaining,
                nonce: order.nonce,
                maker: order.maker,
                price: order.price,
                value: order.value,
                kind: trigger.kind,
                txHash: trigger.txHash ? toBuffer(trigger.txHash) : null,
                txTimestamp: trigger.txTimestamp || null,
                orderKind: order.kind,
                orderCurrency: order.currency,
                orderCurrencyPrice: order.currency_price,
                orderNormalizedValue: order.normalized_value,
                orderCurrencyNormalizedValue: order.currency_normalized_value,
                orderRawData: order.raw_data,
              }
            );
          }

          let eventInfo;
          if (trigger.kind == "cancel") {
            const eventData = {
              orderId: order.id,
              orderSourceIdInt: order.sourceIdInt,
              contract: fromBuffer(order.contract),
              tokenId: order.tokenId,
              maker: fromBuffer(order.maker),
              price: order.price,
              amount: order.quantityRemaining,
              transactionHash: trigger.txHash,
              logIndex: trigger.logIndex,
              batchIndex: trigger.batchIndex,
              blockHash: trigger.blockHash,
              timestamp: trigger.txTimestamp || Math.floor(Date.now() / 1000),
            };

            if (order.side === "buy") {
              eventInfo = {
                kind: processActivityEvent.EventKind.buyOrderCancelled,
                data: eventData,
              };
            }
          } else if (
            ["new-order", "reprice"].includes(trigger.kind) &&
            order.fillabilityStatus == "fillable" &&
            order.approvalStatus == "approved"
          ) {
            const eventData = {
              orderId: order.id,
              orderSourceIdInt: order.sourceIdInt,
              contract: fromBuffer(order.contract),
              tokenId: order.tokenId,
              maker: fromBuffer(order.maker),
              price: order.price,
              amount: order.quantityRemaining,
              transactionHash: trigger.txHash,
              logIndex: trigger.logIndex,
              batchIndex: trigger.batchIndex,
              timestamp: trigger.txTimestamp || Math.floor(Date.now() / 1000),
            };

            if (order.side === "sell") {
              eventInfo = {
                kind: processActivityEvent.EventKind.newSellOrder,
                data: eventData,
              };
            } else if (order.side === "buy") {
              eventInfo = {
                kind: processActivityEvent.EventKind.newBuyOrder,
                data: eventData,
              };
            }
          }
          await WebsocketEventRouter({
            eventInfo: {
              kind: trigger.kind,
              orderId: order.id,
            },
            eventKind:
              order.side === "sell" ? WebsocketEventKind.SellOrder : WebsocketEventKind.BuyOrder,
          });

          if (eventInfo) {
            await processActivityEvent.addActivitiesToList([
              eventInfo as processActivityEvent.EventInfo,
            ]);
          }
        }

        // handle triggering websocket events
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle order info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 50 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type OrderInfo = {
  // The context represents a deterministic id for what triggered
  // the job in the first place. Since this is what's going to be
  // set as the id of the job, the queue is only going to process
  // a context once (further jobs that have the same context will
  // be ignored - as long as the queue still holds past jobs with
  // the same context). It is VERY IMPORTANT to have this in mind
  // and set the contexts distinctive enough so that jobs are not
  // going to be wrongfully ignored. However, to be as performant
  // as possible it's also important to not have the contexts too
  // distinctive in order to avoid doing duplicative work.
  context: string;
  // Information regarding what triggered the job
  trigger: {
    kind: TriggerKind;
    txHash?: string;
    txTimestamp?: number;
    logIndex?: number;
    batchIndex?: number;
    blockHash?: string;
  };
  // When the order id is passed, we recompute the caches of any
  // tokens corresponding to the order (eg. order's token set).
  id?: string;
  // Otherwise we support updating token caches without passing an
  // explicit order so as to support cases like revalidation where
  // we don't have an order to check against.
  tokenSetId?: string;
  side?: "sell" | "buy";
  order?: any;
};

export const addToQueue = async (orderInfos: OrderInfo[]) => {
  // Ignore empty orders
  orderInfos = orderInfos.filter(({ id }) => id !== HashZero);

  await queue.addBulk(
    orderInfos.map((orderInfo) => ({
      name: orderInfo.id ? orderInfo.id : orderInfo.tokenSetId! + "-" + orderInfo.side!,
      data: orderInfo,
      opts: {
        // We should make sure not to perform any expensive work more
        // than once. As such, we keep the last performed jobs in the
        // queue and give all jobs a deterministic id so that we skip
        // handling jobs that already got executed.
        jobId: orderInfo.context,
      },
    }))
  );
};
