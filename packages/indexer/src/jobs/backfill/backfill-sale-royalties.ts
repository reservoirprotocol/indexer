/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { PgPromiseQuery, idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { assignRoyaltiesToFillEvents } from "@/events-sync/handlers/royalties";
import * as es from "@/events-sync/storage";

const QUEUE_NAME = "backfill-sale-royalties";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { block } = job.data;

      const blockRange = 20;
      const results = await redb.manyOrNone(
        `
          SELECT
            fill_events_2.tx_hash,
            fill_events_2.log_index,
            fill_events_2.batch_index,
            fill_events_2.block,
            fill_events_2.order_kind,
            fill_events_2.order_id,
            fill_events_2.order_side,
            fill_events_2.maker,
            fill_events_2.taker,
            fill_events_2.price,
            fill_events_2.contract,
            fill_events_2.token_id,
            fill_events_2.amount,
            fill_events_2.currency,
            fill_events_2.currency_price
          FROM fill_events_2
          WHERE fill_events_2.block < $/block/
            AND fill_events_2.block >= $/block/ - $/blockRange/
          ORDER BY fill_events_2.block DESC
        `,
        {
          block,
          blockRange,
        }
      );

      const fillEvents: es.fills.Event[] = results.map((r) => ({
        orderKind: r.order_kind,
        orderId: r.order_id,
        orderSide: r.order_side,
        maker: fromBuffer(r.maker),
        taker: fromBuffer(r.taker),
        price: r.price,
        contract: fromBuffer(r.contract),
        tokenId: r.token_id,
        amount: r.amount,
        currency: fromBuffer(r.currency),
        currencyPrice: r.currency_price,
        baseEventParams: {
          txHash: fromBuffer(r.tx_hash),
          logIndex: r.log_index,
          batchIndex: r.batch_index,
        } as any,
      }));

      await assignRoyaltiesToFillEvents(fillEvents);

      const queries: PgPromiseQuery[] = fillEvents.map((event) => {
        return {
          query: `
            UPDATE fill_events_2 SET
              royalty_fee_bps = $/royaltyFeeBps/,
              marketplace_fee_bps = $/marketplaceFeeBps/,
              royalty_fee_breakdown = $/royaltyFeeBreakdown:json/,
              marketplace_fee_breakdown = $/marketplaceFeeBreakdown:json/,
              paid_full_royalty = $/paidFullRoyalty/,
              net_amount = $/netAmount/,
              updated_at = now()
            WHERE tx_hash = $/txHash/
              AND log_index = $/logIndex/
              AND batch_index = $/batchIndex/
          `,
          values: {
            royaltyFeeBps: event.royaltyFeeBps || undefined,
            marketplaceFeeBps: event.marketplaceFeeBps || undefined,
            royaltyFeeBreakdown: event.royaltyFeeBreakdown || undefined,
            marketplaceFeeBreakdown: event.marketplaceFeeBreakdown || undefined,
            paidFullRoyalty: event.paidFullRoyalty || undefined,
            netAmount: event.netAmount || undefined,
            txHash: toBuffer(event.baseEventParams.txHash),
            logIndex: event.baseEventParams.logIndex,
            batchIndex: event.baseEventParams.batchIndex,
          },
        };
      });

      await idb.none(pgp.helpers.concat(queries));

      if (results.length >= 0) {
        const lastResult = results[results.length - 1];
        await addToQueue(lastResult.block);
      } else if (block > 7000000) {
        await addToQueue(block - blockRange);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  if (config.chainId === 1) {
    redlock
      .acquire([`${QUEUE_NAME}-lock`], 60 * 60 * 24 * 30 * 1000)
      .then(async () => {
        await addToQueue(16698570);
      })
      .catch(() => {
        // Skip on any errors
      });
  }
}

export const addToQueue = async (block: number) => {
  await queue.add(randomUUID(), { block });
};
