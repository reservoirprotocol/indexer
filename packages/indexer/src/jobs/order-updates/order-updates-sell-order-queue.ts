/* eslint-disable @typescript-eslint/no-explicit-any */

import { HashZero } from "@ethersproject/constants";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { TriggerKind } from "@/jobs/order-updates/types";
import * as processActivityEvent from "@/jobs/activities/process-activity-event";
import * as updateNftBalanceFloorAskPriceQueue from "@/jobs/nft-balance-updates/update-floor-ask-price-queue";
import {
  WebsocketEventKind,
  WebsocketEventRouter,
} from "../websocket-events/websocket-event-router";
import {
  normalizedFloorQueueJob,
  NormalizedFloorQueueJobPayload,
} from "@/jobs/token-updates/normalized-floor-queue-job";
import { tokenFloorQueueJob } from "@/jobs/token-updates/token-floor-queue-job";

const QUEUE_NAME = "order-updates-sell-order";

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
      const { trigger, tokenSetId, order } = job.data as OrderInfo;

      try {
        if (tokenSetId) {
          // Update token floor
          const floorAskInfo: NormalizedFloorQueueJobPayload = {
            kind: trigger.kind,
            tokenSetId,
            txHash: trigger.txHash || null,
            txTimestamp: trigger.txTimestamp || null,
          };

          await Promise.all([
            tokenFloorQueueJob.addToQueue([floorAskInfo]),
            normalizedFloorQueueJob.addToQueue([floorAskInfo]),
          ]);
        }

        if (order) {
          order.contract = toBuffer(order.contract);
          order.maker = toBuffer(order.maker);
          order.currency = toBuffer(order.currency);
          // Insert a corresponding ask order event
          if (order.side === "sell") {
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
                    order_nonce,
                    maker,
                    price,
                    tx_hash,
                    tx_timestamp,
                    order_kind,
                    order_token_set_id,
                    order_dynamic,
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
                        WHEN $/approvalStatus/ = 'disabled' THEN 'inactive'
                        ELSE 'active'
                      END
                    )::order_event_status_t,
                    $/contract/,
                    $/tokenId/,
                    $/id/,
                    $/sourceIdInt/,
                    $/validBetween/,
                    $/quantityRemaining/,
                    $/nonce/,
                    $/maker/,
                    $/value/,
                    $/txHash/,
                    $/txTimestamp/,
                    $/orderKind/,
                    $/orderTokenSetId/,
                    $/orderDynamic/,
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
                tokenId: order.tokenId,
                id: order.id,
                sourceIdInt: order.sourceIdInt,
                validBetween: order.validBetween,
                quantityRemaining: order.quantityRemaining,
                nonce: order.nonce,
                maker: order.maker,
                value: order.value,
                kind: trigger.kind,
                txHash: trigger.txHash ? toBuffer(trigger.txHash) : null,
                txTimestamp: trigger.txTimestamp || null,
                orderKind: order.kind,
                orderTokenSetId: order.tokenSetId,
                orderDynamic: order.dynamic,
                orderCurrency: order.currency,
                orderCurrencyPrice: order.currency_price,
                orderNormalizedValue: order.normalized_value,
                orderCurrencyNormalizedValue: order.currency_normalized_value,
                orderRawData: order.raw_data,
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
            }
          }

          if (config.doOldOrderWebsocketWork) {
            await WebsocketEventRouter({
              eventInfo: {
                kind: trigger.kind,
                orderId: order.id,
              },
              eventKind:
                order.side === "sell" ? WebsocketEventKind.SellOrder : WebsocketEventKind.BuyOrder,
            });
          }

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
