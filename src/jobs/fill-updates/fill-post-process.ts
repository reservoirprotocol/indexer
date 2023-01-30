import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, PgPromiseQuery, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as es from "@/events-sync/storage";

import { assignRoyaltiesToFillEvents } from "@/events-sync/handlers/royalties";
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
        ]);

        const queries: PgPromiseQuery[] = allFillEvents.map((event) => {
          return {
            query: `
                UPDATE fill_events_2 SET 
                  wash_trading_score = $/wash_trading_score/,
                  royalty_fee_bps = $/royalty_fee_bps/,
                  marketplace_fee_bps = $/marketplace_fee_bps/,
                  royalty_fee_breakdown = $/royalty_fee_breakdown:json/,
                  marketplace_fee_breakdown = $/marketplace_fee_breakdown:json/,
                  paid_full_royalty = $/paid_full_royalty/,
                  net_amount = $/net_amount/
                WHERE tx_hash = $/tx_hash/
                  AND log_index = $/log_index/
                  AND batch_index = $/batch_index/
              `,
            values: {
              wash_trading_score: event.washTradingScore || 0,
              royalty_fee_bps: event.royaltyFeeBps || undefined,
              marketplace_fee_bps: event.marketplaceFeeBps || undefined,
              royalty_fee_breakdown: event.royaltyFeeBreakdown || undefined,
              marketplace_fee_breakdown: event.marketplaceFeeBreakdown || undefined,
              paid_full_royalty: event.paidFullRoyalty || undefined,
              net_amount: event.netAmount || undefined,

              tx_hash: toBuffer(event.baseEventParams.txHash),
              log_index: event.baseEventParams.logIndex,
              batch_index: event.baseEventParams.batchIndex,
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
