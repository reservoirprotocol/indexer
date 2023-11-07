/* eslint-disable @typescript-eslint/no-explicit-any */

import { HashZero } from "@ethersproject/constants";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer, toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import {
  EventKind as ProcessActivityEventKind,
  processActivityEventJob,
  ProcessActivityEventJobPayload,
} from "@/jobs/activities/process-activity-event-job";
import { nftBalanceUpdateFloorAskJob } from "@/jobs/nft-balance-updates/update-floor-ask-price-job";
import { TriggerKind } from "@/jobs/order-updates/types";
import { topBidQueueJob } from "@/jobs/token-set-updates/top-bid-queue-job";
import { topBidSingleTokenQueueJob } from "@/jobs/token-set-updates/top-bid-single-token-queue-job";
import { normalizedFloorQueueJob } from "@/jobs/token-updates/normalized-floor-queue-job";
import { tokenFloorQueueJob } from "@/jobs/token-updates/token-floor-queue-job";
import { BidEventsList } from "@/models/bid-events-list";
import { Sources } from "@/models/sources";
import { isWhitelistedCurrency } from "@/utils/prices";

export type OrderUpdatesByIdJobPayload = {
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
  ingestMethod?: "websocket" | "rest";
  ingestDelay?: number;
};

export default class OrderUpdatesByIdJob extends AbstractRabbitMqJobHandler {
  queueName = "order-updates-by-id";
  maxRetries = 10;
  concurrency = 80;
  lazyMode = true;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: OrderUpdatesByIdJobPayload) {
    const { id, trigger, ingestMethod, ingestDelay } = payload;
    let { side, tokenSetId } = payload;

    try {
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
              orders.nonce,
              orders.maker,
              orders.price,
              orders.value,
              orders.fillability_status AS "fillabilityStatus",
              orders.approval_status AS "approvalStatus",
              orders.kind,
              orders.dynamic,
              orders.currency,
              orders.currency_price,
              orders.normalized_value,
              orders.currency_normalized_value,
              orders.raw_data,
              orders.originated_at AS "originatedAt",
              orders.created_at AS "createdAt",
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

        side = order?.side;
        tokenSetId = order?.tokenSetId;
      }

      if (side && tokenSetId) {
        if (side === "buy") {
          const topBidInfo = {
            tokenSetId,
            kind: trigger.kind,
            txHash: trigger.txHash || null,
            txTimestamp: trigger.txTimestamp || null,
          };

          if (tokenSetId.startsWith("token")) {
            await topBidSingleTokenQueueJob.addToQueue([topBidInfo]);
          } else {
            await topBidQueueJob.addToQueue([topBidInfo]);
          }
        }

        if (side === "sell") {
          // Update token floor
          const floorAskInfo = {
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
                value: isWhitelistedCurrency(fromBuffer(order.currency)) ? 0 : order.value,
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

            await nftBalanceUpdateFloorAskJob.addToQueue([updateFloorAskPriceInfo]);
          } else if (order.side === "buy") {
            const bidEventsList = new BidEventsList();
            await bidEventsList.add([
              {
                order: {
                  ...order,
                  maker: fromBuffer(order.maker),
                  currency: fromBuffer(order.currency),
                  contract: fromBuffer(order.contract),
                },
                trigger,
              },
            ]);
          }

          let eventInfo;
          if (trigger.kind == "cancel") {
            const eventData = {
              orderId: order.id,
              txHash: trigger.txHash,
              logIndex: trigger.logIndex,
              batchIndex: trigger.batchIndex,
            };

            if (order.side === "sell") {
              eventInfo = {
                kind: ProcessActivityEventKind.sellOrderCancelled,
                data: eventData,
              };
            } else if (order.side === "buy") {
              eventInfo = {
                kind: ProcessActivityEventKind.buyOrderCancelled,
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
              txHash: trigger.txHash,
              logIndex: trigger.logIndex,
              batchIndex: trigger.batchIndex,
            };

            if (order.side === "sell") {
              if (order.kind === "blur" && order.raw_data?.expirationTime != null) {
                // TODO: Remove once we stop ingesting blur order in old format.
              } else {
                eventInfo = {
                  kind: ProcessActivityEventKind.newSellOrder,
                  data: eventData,
                };
              }
            } else if (order.side === "buy") {
              eventInfo = {
                kind: ProcessActivityEventKind.newBuyOrder,
                data: eventData,
              };
            }
          }

          if (eventInfo) {
            await processActivityEventJob.addToQueue([eventInfo as ProcessActivityEventJobPayload]);
          }
        }
      }

      // Log order latency for new orders
      if (order && order.validBetween && trigger.kind === "new-order") {
        try {
          const orderStart = Math.floor(
            new Date(order.originatedAt ?? JSON.parse(order.validBetween)[0]).getTime() / 1000
          );
          const orderCreated = Math.floor(new Date(order.createdAt).getTime() / 1000);

          if (orderStart <= orderCreated) {
            const source = (await Sources.getInstance()).get(order.sourceIdInt);
            const orderType =
              side === "sell"
                ? "listing"
                : tokenSetId?.startsWith("token")
                ? "token_offer"
                : tokenSetId?.startsWith("list")
                ? "attribute_offer"
                : "collection_offer";

            logger.info(
              "order-latency",
              JSON.stringify({
                latency: orderCreated - orderStart - Number(ingestDelay ?? 0),
                source: source?.getTitle() ?? null,
                orderId: order.id,
                orderKind: order.kind,
                orderType,
                ingestMethod: ingestMethod ?? "rest",
              })
            );
          }
        } catch {
          // Ignore errors
        }
      }
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to handle order info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(orderInfos: OrderUpdatesByIdJobPayload[]) {
    // Ignore empty orders
    orderInfos = orderInfos.filter(({ id }) => id !== HashZero);

    await this.sendBatch(orderInfos.map((info) => ({ payload: info, jobId: info.context })));
  }
}

export const orderUpdatesByIdJob = new OrderUpdatesByIdJob();
