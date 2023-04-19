import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { PgPromiseQuery, idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as es from "@/events-sync/storage";

import { assignRoyaltiesToFillEvents } from "@/events-sync/handlers/royalties";
import { assignAttributionToFillEvents } from "@/events-sync/handlers/attribution";
import { assignWashTradingScoreToFillEvents } from "@/events-sync/handlers/utils/fills";

const QUEUE_NAME = "fill-post-process";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
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
      const allFillEvents = job.data as es.fills.Event[];

      try {
        await Promise.all([
          assignRoyaltiesToFillEvents(allFillEvents),
          assignWashTradingScoreToFillEvents(allFillEvents),
          assignAttributionToFillEvents(allFillEvents),
        ]);

        const queries: PgPromiseQuery[] = allFillEvents.map((event) => {
          return {
            query: `
              UPDATE fill_events_2 SET
                wash_trading_score = $/washTradingScore/,
                royalty_fee_bps = $/royaltyFeeBps/,
                marketplace_fee_bps = $/marketplaceFeeBps/,
                royalty_fee_breakdown = $/royaltyFeeBreakdown:json/,
                marketplace_fee_breakdown = $/marketplaceFeeBreakdown:json/,
                paid_full_royalty = $/paidFullRoyalty/,
                net_amount = $/netAmount/,
                order_source_id_int = $/orderSourceId/,
                fill_source_id = $/fillSourceId/,
                aggregator_source_id = $/aggregatorSourceId/,
                taker = $/taker/,
                updated_at = now()
              WHERE tx_hash = $/txHash/
                AND log_index = $/logIndex/
                AND batch_index = $/batchIndex/
            `,
            values: {
              washTradingScore: event.washTradingScore || 0,
              royaltyFeeBps: event.royaltyFeeBps || undefined,
              marketplaceFeeBps: event.marketplaceFeeBps || undefined,
              royaltyFeeBreakdown: event.royaltyFeeBreakdown || undefined,
              marketplaceFeeBreakdown: event.marketplaceFeeBreakdown || undefined,
              paidFullRoyalty: event.paidFullRoyalty || undefined,
              netAmount: event.netAmount || undefined,
              txHash: toBuffer(event.baseEventParams.txHash),
              logIndex: event.baseEventParams.logIndex,
              batchIndex: event.baseEventParams.batchIndex,
              fillSourceId: event.fillSourceId || null,
              aggregatorSourceId: event.aggregatorSourceId || null,
              orderSourceId: event.orderSourceId || null,
              taker: toBuffer(event.taker),
            },
          };
        });

        await idb.none(pgp.helpers.concat(queries));
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle fill info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (fillEvents: es.fills.Event[][]) =>
  queue.addBulk(
    fillEvents.map((event) => ({
      name: randomUUID(),
      data: event,
    }))
  );
