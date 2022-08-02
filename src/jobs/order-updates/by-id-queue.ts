import _ from "lodash";

import { HashZero } from "@ethersproject/constants";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { TriggerKind } from "@/jobs/order-updates/types";

import * as collectionUpdatesFloorAsk from "@/jobs/collection-updates/floor-queue";
import * as handleNewSellOrder from "@/jobs/update-attribute/handle-new-sell-order";
import * as handleNewBuyOrder from "@/jobs/update-attribute/handle-new-buy-order";
import * as updateNftBalanceFloorAskPriceQueue from "@/jobs/nft-balance-updates/update-floor-ask-price-queue";
import * as processActivityEvent from "@/jobs/activities/process-activity-event";
import * as topBidUpdateQueue from "@/jobs/bid-updates/top-bid-update-queue";

const QUEUE_NAME = "order-updates-by-id";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 10000,
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
      const { id, trigger } = job.data as OrderInfo;
      let { side, tokenSetId } = job.data as OrderInfo;

      logger.info(QUEUE_NAME, `Start to handle order info ${JSON.stringify(job.data)}`);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let order: any;

        if (id) {
          // Fetch the order's associated data
          order = await idb.oneOrNone(
            `
              SELECT
                orders.id,
                orders.side,
                orders.token_set_id AS "tokenSetId",
                orders.source_id_int AS "sourceIdInt",
                orders.valid_between AS "validBetween",
                COALESCE(orders.quantity_remaining, 1) AS "quantityRemaining",
                orders.maker,
                orders.value,
                orders.fillability_status AS "fillabilityStatus",
                orders.approval_status AS "approvalStatus",
                token_sets_tokens.contract,
                token_sets_tokens.token_id AS "tokenId"
              FROM orders
              JOIN token_sets_tokens
                ON orders.token_set_id = token_sets_tokens.token_set_id
              WHERE orders.id = $/id/
              LIMIT 1
            `,
            { id }
          );

          logger.info(
            QUEUE_NAME,
            `Found order for order info ${JSON.stringify(job.data)}: ${JSON.stringify(order)}`
          );

          side = order?.side;
          tokenSetId = order?.tokenSetId;
        }

        if (side && tokenSetId) {
          // If the order is a complex 'buy' order, then recompute the top bid cache on the token set
          if (side === "buy" && !tokenSetId.startsWith("token")) {
            const buyOrderResult = await idb.manyOrNone(
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
                  AND token_sets.top_buy_id IS DISTINCT FROM x.order_id
                RETURNING
                  attribute_id AS "attributeId",
                  top_buy_value AS "topBuyValue"
              `,
              { tokenSetId }
            );

            for (const result of buyOrderResult) {
              if (!_.isNull(result.attributeId)) {
                await handleNewBuyOrder.addToQueue(result);
              }
            }
          }

          if (side === "sell") {
            // Atomically update the cache and trigger an api event if needed
            const sellOrderResult = await idb.oneOrNone(
              `
                WITH z AS (
                  SELECT
                    x.contract,
                    x.token_id,
                    y.order_id,
                    y.value,
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
                      orders.value,
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
                    ORDER BY orders.value, orders.fee_bps
                    LIMIT 1
                  ) y ON TRUE
                ),
                w AS (
                  UPDATE tokens SET
                    floor_sell_id = z.order_id,
                    floor_sell_value = z.value,
                    floor_sell_maker = z.maker,
                    floor_sell_valid_from = least(
                      2147483647::NUMERIC,
                      date_part('epoch', lower(z.valid_between))
                    )::INT,
                    floor_sell_valid_to = least(
                      2147483647::NUMERIC,
                      coalesce(
                        nullif(date_part('epoch', upper(z.valid_between)), 'Infinity'),
                        0
                      )
                    )::INT,
                    floor_sell_source_id_int = z.source_id_int,
                    floor_sell_is_reservoir = z.is_reservoir,
                    updated_at = now()
                  FROM z
                  WHERE tokens.contract = z.contract
                    AND tokens.token_id = z.token_id
                    AND (
                      tokens.floor_sell_id IS DISTINCT FROM z.order_id
                      OR tokens.floor_sell_maker IS DISTINCT FROM z.maker
                      OR tokens.floor_sell_value IS DISTINCT FROM z.value
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
                      SELECT tokens.floor_sell_value FROM tokens
                      WHERE tokens.contract = z.contract
                        AND tokens.token_id = z.token_id
                    ) AS old_floor_sell_value
                )
                INSERT INTO token_floor_sell_events(
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
                kind: trigger.kind,
                txHash: trigger.txHash ? toBuffer(trigger.txHash) : null,
                txTimestamp: trigger.txTimestamp || null,
              }
            );

            if (sellOrderResult) {
              // Update attributes floor
              sellOrderResult.contract = fromBuffer(sellOrderResult.contract);
              await handleNewSellOrder.addToQueue(sellOrderResult);

              // Update collection floor
              sellOrderResult.txHash = sellOrderResult.txHash
                ? fromBuffer(sellOrderResult.txHash)
                : null;
              await collectionUpdatesFloorAsk.addToQueue([sellOrderResult]);
            }
          } else if (side === "buy") {
            await topBidUpdateQueue.addToQueue(tokenSetId!);
          }

          if (order) {
            if (order.side === "sell") {
              // Insert a corresponding order event
              await idb.none(
                `
                  INSERT INTO order_events (
                    kind,
                    status,
                    contract,
                    token_id,
                    order_id,
                    order_source_id_int,
                    order_valid_between,
                    order_quantity_remaining,
                    maker,
                    price,
                    tx_hash,
                    tx_timestamp
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
                    $/tokenId/,
                    $/id/,
                    $/sourceIdInt/,
                    $/validBetween/,
                    $/quantityRemaining/,
                    $/maker/,
                    $/value/,
                    $/txHash/,
                    $/txTimestamp/
                  )
                `,
                {
                  fillabilityStatus: order.fillabilityStatus,
                  approvalStatus: order.approvalStatus,
                  contract: order.contract,
                  tokenId: order.tokenId,
                  id: order.id,
                  sourceIdInt: order.sourceIdInt,
                  validBetween: order.validBetween,
                  quantityRemaining: order.quantityRemaining,
                  maker: order.maker,
                  value: order.value,
                  kind: trigger.kind,
                  txHash: trigger.txHash ? toBuffer(trigger.txHash) : null,
                  txTimestamp: trigger.txTimestamp || null,
                }
              );

              const updateFloorAskPriceInfo = {
                contract: fromBuffer(order.contract),
                tokenId: order.tokenId,
                owner: fromBuffer(order.maker),
              };

              await updateNftBalanceFloorAskPriceQueue.addToQueue([updateFloorAskPriceInfo]);
            }

            let eventInfo;

            if (trigger.kind == "cancel") {
              const eventData = {
                orderId: order.id,
                contract: fromBuffer(order.contract),
                tokenId: order.tokenId,
                maker: fromBuffer(order.maker),
                price: order.value,
                amount: order.quantityRemaining,
                transactionHash: trigger.txHash,
                logIndex: trigger.logIndex,
                batchIndex: trigger.batchIndex,
                blockHash: trigger.blockHash,
                timestamp: trigger.txTimestamp,
              };

              if (order.side === "sell") {
                eventInfo = {
                  kind: processActivityEvent.EventKind.sellOrderCancelled,
                  data: eventData,
                };
              } else if (order.side === "buy") {
                eventInfo = {
                  kind: processActivityEvent.EventKind.buyOrderCancelled,
                  data: eventData,
                };
              }
            } else if (
              trigger.kind == "new-order" &&
              order.fillabilityStatus == "fillable" &&
              order.approvalStatus == "approved"
            ) {
              const eventData = {
                orderId: order.id,
                contract: fromBuffer(order.contract),
                tokenId: order.tokenId,
                maker: fromBuffer(order.maker),
                price: order.value,
                amount: order.quantityRemaining,
                timestamp: Date.now() / 1000,
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

            if (eventInfo) {
              await processActivityEvent.addToQueue([eventInfo as processActivityEvent.EventInfo]);
            }
          }
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle order info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 15 }
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
