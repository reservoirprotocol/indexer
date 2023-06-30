import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import crypto from "crypto";

import { randomUUID } from "crypto";
import _ from "lodash";
import { getJoiSaleObject } from "@/common/joi";

import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { publishWebsocketEvent } from "@/common/websocketPublisher";

const QUEUE_NAME = "sale-websocket-events-trigger-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.doWebsocketServerWork && config.kafkaBrokers.length > 0) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { data } = job.data as EventInfo;

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
            log_index: data.log_index,
            batch_index: data.batch_index,
            txHash: toBuffer(data.tx_hash),
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
          .update(
            `${fromBuffer(r.tx_hash)}${r.maker}${r.taker}${r.contract}${r.token_id}${r.price}`
          )
          .digest("hex");

        delete result.saleId;

        let eventType = "";
        if (data.trigger === "insert") eventType = "sale.created";
        else if (data.trigger === "update") {
          // if isDeleted is true, then it's a delete event
          if (r.is_deleted) eventType = "sale.deleted";
          else eventType = "sale.updated";
        }

        await publishWebsocketEvent({
          event: eventType,
          tags: {
            contract: fromBuffer(r.contract),
            maker: fromBuffer(r.maker),
            taker: fromBuffer(r.taker),
          },
          data: result,
          offset: data.offset,
        });
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Error processing websocket event. data=${JSON.stringify(data)}, error=${JSON.stringify(
            error
          )}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 20 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored. error=${JSON.stringify(error)}`);
  });
}

export type EventInfo = {
  data: SaleWebsocketEventInfo;
};

export const addToQueue = async (events: EventInfo[]) => {
  if (!config.doWebsocketServerWork) {
    return;
  }

  await queue.addBulk(
    _.map(events, (event) => ({
      name: randomUUID(),
      data: event,
    }))
  );
};

export type SaleWebsocketEventInfo = {
  tx_hash: string;
  log_index: number;
  batch_index: number;
  trigger: "insert" | "update" | "delete";
  offset: string;
};
