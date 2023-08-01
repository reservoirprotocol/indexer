import { logger } from "@/common/logger";
import { config } from "@/config/index";
import crypto from "crypto";
import { getJoiSaleObject } from "@/common/joi";

import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { OrderKind } from "@/orderbook/orders";

export type SaleWebsocketEventsTriggerQueueJobPayload = {
  data: SaleWebsocketEventInfo;
};

const changedMapping = {
  wash_trading_score: "washTradingScore",
  royalty_fee_bps: "fees.royaltyFeeBps",
  marketplace_fee_bps: "fees.marketplaceFeeBps",
  royalty_fee_breakdown: "fees.royaltyFeeBreakdown",
  marketplace_fee_breakdown: "fees.marketplaceFeeBreakdown",
  paid_full_royalty: "fees.paidFullRoyalty",
};

export class SaleWebsocketEventsTriggerQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "sale-websocket-events-trigger-queue";
  maxRetries = 5;
  concurrency = 10;
  consumerTimeout = 60000;
  backoff = {
    type: "exponential",
    delay: 1000,
  } as BackoffStrategy;

  protected async process(payload: SaleWebsocketEventsTriggerQueueJobPayload) {
    const { data } = payload;

    try {
      const r = await idb.oneOrNone(
        `
        SELECT
          fill_events_2_data.*,
          tokens_data.name,
          tokens_data.image,
          tokens_data.collection_id,
          tokens_data.collection_name
      FROM (
        SELECT
          fill_events_2.contract,
          fill_events_2.token_id,
          fill_events_2.order_id,
          fill_events_2.order_side,
          fill_events_2.order_kind,
          fill_events_2.order_source_id_int,
          fill_events_2.maker,
          fill_events_2.taker,
          fill_events_2.amount,
          fill_events_2.fill_source_id,
          fill_events_2.block,
          fill_events_2.tx_hash,
          fill_events_2.timestamp,
          fill_events_2.price,
          fill_events_2.currency,
          TRUNC(fill_events_2.currency_price, 0) AS currency_price,
          currencies.decimals,
          fill_events_2.usd_price,
          fill_events_2.block,
          fill_events_2.log_index,
          fill_events_2.batch_index,
          fill_events_2.wash_trading_score,
          fill_events_2.royalty_fee_bps,
          fill_events_2.marketplace_fee_bps,
          fill_events_2.royalty_fee_breakdown,
          fill_events_2.marketplace_fee_breakdown,
          fill_events_2.paid_full_royalty,
          fill_events_2.is_deleted,
          fill_events_2.updated_at,
          fill_events_2.created_at
        FROM fill_events_2
        LEFT JOIN currencies
          ON fill_events_2.currency = currencies.contract
        WHERE
          fill_events_2.tx_hash = $/txHash/ AND fill_events_2.log_index = $/log_index/ AND fill_events_2.batch_index = $/batch_index/
      ) AS fill_events_2_data
        LEFT JOIN LATERAL (
          SELECT
            tokens.name,
            tokens.image,
            tokens.collection_id,
            collections.name AS collection_name
          FROM tokens
          LEFT JOIN collections 
            ON tokens.collection_id = collections.id
          WHERE fill_events_2_data.token_id = tokens.token_id
            AND fill_events_2_data.contract = tokens.contract
        ) tokens_data ON TRUE       
      `,
        {
          log_index: data.after.log_index,
          batch_index: data.after.batch_index,
          txHash: toBuffer(data.after.tx_hash),
        }
      );

      const result = await getJoiSaleObject({
        prices: {
          gross: {
            amount: r.currency_price ?? r.price,
            nativeAmount: r.price,
            usdAmount: r.usd_price,
          },
        },
        fees: {
          royaltyFeeBps: r.royalty_fee_bps,
          marketplaceFeeBps: r.marketplace_fee_bps,
          paidFullRoyalty: r.paid_full_royalty,
          royaltyFeeBreakdown: r.royalty_fee_breakdown,
          marketplaceFeeBreakdown: r.marketplace_fee_breakdown,
        },
        currencyAddress: r.currency,
        timestamp: r.timestamp,
        contract: r.contract,
        tokenId: r.token_id,
        name: r.name,
        image: r.image,
        collectionId: r.collection_id,
        collectionName: r.collection_name,
        washTradingScore: r.wash_trading_score,
        orderId: r.order_id,
        orderSourceId: r.order_source_id_int,
        orderSide: r.order_side,
        orderKind: r.order_kind,
        maker: r.maker,
        taker: r.taker,
        amount: r.amount,
        fillSourceId: r.fill_source_id,
        block: r.block,
        txHash: r.tx_hash,
        logIndex: r.log_index,
        batchIndex: r.batch_index,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      });

      result.id = crypto
        .createHash("sha256")
        .update(`${fromBuffer(r.tx_hash)}${r.maker}${r.taker}${r.contract}${r.token_id}${r.price}`)
        .digest("hex");

      delete result.saleId;

      let eventType = "";
      const changed = [];
      if (data.trigger === "insert") eventType = "sale.created";
      else if (data.trigger === "update") {
        // if isDeleted is true, then it's a delete event
        if (r.is_deleted) eventType = "sale.deleted";
        else {
          eventType = "sale.updated";
          if (data.before) {
            for (const key in changedMapping) {
              if (data.before[key as keyof SaleInfo] !== data.after[key as keyof SaleInfo]) {
                changed.push(changedMapping[key as keyof typeof changedMapping]);
              }
            }

            if (!changed.length) {
              logger.info(
                this.queueName,
                `No changes detected for event. before=${JSON.stringify(
                  data.before
                )}, after=${JSON.stringify(data.after)}`
              );
              return;
            }
          }
        }
      }

      await publishWebsocketEvent({
        event: eventType,
        tags: {
          contract: fromBuffer(r.contract),
          maker: fromBuffer(r.maker),
          taker: fromBuffer(r.taker),
        },
        changed,
        data: result,
        offset: data.offset,
      });
    } catch (error) {
      logger.error(
        this.queueName,
        `Error processing websocket event. data=${JSON.stringify(data)}, error=${JSON.stringify(
          error
        )}`
      );
      throw error;
    }
  }

  public async addToQueue(events: SaleWebsocketEventsTriggerQueueJobPayload[]) {
    if (!config.doWebsocketServerWork) {
      return;
    }

    await this.sendBatch(
      events.map((event) => ({
        payload: event,
      }))
    );
  }
}

export type EventInfo = {
  data: SaleWebsocketEventInfo;
};

interface SaleInfo {
  contract: string;
  token_id: string;
  order_id: string;
  order_side: string;
  order_kind: OrderKind;
  order_source_id_int: number;
  maker: string;
  taker: string;
  amount: number;
  fill_source_id: number;
  block: number;
  tx_hash: string;
  timestamp: number;
  price: string;
  currency: string;
  currency_price: string;
  usd_price: string;
  log_index: number;
  batch_index: number;
  wash_trading_score: number;
  royalty_fee_bps: number;
  marketplace_fee_bps: number;
  royalty_fee_breakdown: string;
  marketplace_fee_breakdown: string;
  paid_full_royalty: boolean;
  is_deleted: boolean;
  updated_at: string;
  created_at: string;
}

export type SaleWebsocketEventInfo = {
  before: SaleInfo;
  after: SaleInfo;
  trigger: "insert" | "update" | "delete";
  offset: string;
};

export const saleWebsocketEventsTriggerQueueJob = new SaleWebsocketEventsTriggerQueueJob();
