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
import { fetchTransactionTraces } from "@/events-sync/utils";
import * as blockCheckQueue from "@/jobs/events-sync/block-check-queue";

const QUEUE_NAME = "backfill-sale-royalties";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "fixed",
      delay: 30000,
    },
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
      const { fromBlock, toBlock, currentBlock } = job.data;

      const time1 = performance.now();

      const blockRange = 10;
      const results = await redb.manyOrNone(
        `
          SELECT
            fill_events_2.tx_hash,
            fill_events_2.block,
            fill_events_2.block_hash,
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
            AND fill_events_2.order_kind != 'mint'
          ORDER BY fill_events_2.block DESC
        `,
        {
          block: currentBlock,
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
          block: r.block,
          blockHash: fromBuffer(r.block_hash),
        } as any,
      }));

      const time2 = performance.now();

      const fillEventsPerTxHash: { [txHash: string]: es.fills.Event[] } = {};
      const blockToBlockHash: { [block: number]: Set<string> } = {};
      for (const fe of fillEvents) {
        if (!fillEventsPerTxHash[fe.baseEventParams.txHash]) {
          fillEventsPerTxHash[fe.baseEventParams.txHash] = [];
        }
        fillEventsPerTxHash[fe.baseEventParams.txHash].push(fe);

        if (!blockToBlockHash[fe.baseEventParams.block]) {
          blockToBlockHash[fe.baseEventParams.block] = new Set<string>();
        }
        blockToBlockHash[fe.baseEventParams.block].add(fe.baseEventParams.blockHash);
      }

      // Fix any orhpaned blocks along the way
      for (const [block, blockHashes] of Object.entries(blockToBlockHash)) {
        if (blockHashes.size > 1) {
          await blockCheckQueue.addBulk(
            [...blockHashes.values()].map((blockHash) => ({
              block: Number(block),
              blockHash,
              delay: 0,
            }))
          );
        }
      }

      // Prepare the caches for efficiency

      await Promise.all(
        Object.entries(fillEventsPerTxHash).map(async ([txHash, fillEvents]) =>
          redis.set(`get-fill-events-from-tx:${txHash}`, JSON.stringify(fillEvents), "EX", 10 * 60)
        )
      );

      const traces = await fetchTransactionTraces(Object.keys(fillEventsPerTxHash));
      await Promise.all(
        Object.values(traces).map(async (trace) =>
          redis.set(`fetch-transaction-trace:${trace.hash}`, JSON.stringify(trace), "EX", 10 * 60)
        )
      );

      const time3 = performance.now();

      await assignRoyaltiesToFillEvents(fillEvents);

      const time4 = performance.now();

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

      if (queries.length) {
        await idb.none(pgp.helpers.concat(queries));
      }

      const time5 = performance.now();

      logger.info(
        "debug-performance",
        JSON.stringify({
          databaseFetch: (time2 - time1) / 1000,
          traceFetch: (time3 - time2) / 1000,
          royaltyDetection: (time4 - time3) / 1000,
          update: (time5 - time4) / 1000,
        })
      );

      const nextBlock = currentBlock - blockRange;
      if (nextBlock > fromBlock) {
        await addToQueue(fromBlock, toBlock, nextBlock);
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  if (config.chainId === 1) {
    redlock
      .acquire([`${QUEUE_NAME}-lock-4`], 60 * 60 * 24 * 30 * 1000)
      .then(async () => {
        await addToQueue(15400000, 15500000, 15500002);
        await addToQueue(15300000, 15400000, 15400002);
        await addToQueue(15200000, 15300000, 15300002);
        await addToQueue(15100000, 15200000, 15200002);
        await addToQueue(15000000, 15100000, 15100002);
        await addToQueue(14900000, 15000000, 15000002);
        await addToQueue(14800000, 14900000, 14900002);
      })
      .catch(() => {
        // Skip on any errors
      });
  }
}

export const addToQueue = async (fromBlock: number, toBlock: number, currentBlock: number) => {
  await queue.add(
    randomUUID(),
    { fromBlock, toBlock, currentBlock },
    { jobId: `${fromBlock}-${toBlock}-${currentBlock}` }
  );
};
