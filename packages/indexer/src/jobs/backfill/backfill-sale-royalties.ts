/* eslint-disable @typescript-eslint/no-explicit-any */

import { StaticJsonRpcProvider } from "@ethersproject/providers";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { PgPromiseQuery, idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { assignRoyaltiesToFillEvents } from "@/events-sync/handlers/royalties";
import * as es from "@/events-sync/storage";
import { fetchTransactionTraces } from "@/events-sync/utils";
import { blockCheckJob } from "@/jobs/events-sync/block-check-queue-job";

const QUEUE_NAME = "backfill-sale-royalties";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 30,
    backoff: {
      type: "exponential",
      delay: 10000,
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
      const details = job.data as Details;

      const time1 = performance.now();

      const blockRange = (details.data as any).blockRange ?? 10;
      const timestampRange = (details.data as any).timestampRange ?? 1000;

      let results: any[] = [];
      if (details.kind === "all") {
        results = await redb.manyOrNone(
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
            WHERE fill_events_2.block <= $/block/
              AND fill_events_2.block > $/block/ - $/blockRange/
              AND fill_events_2.order_kind != 'mint'
            ORDER BY fill_events_2.block DESC
          `,
          {
            block: details.data.toBlock,
            blockRange,
          }
        );
      } else if (details.kind === "contract") {
        // First get all relevant transactions
        const tmpResult = await redb.manyOrNone(
          `
            SELECT
              fill_events_2.tx_hash
            FROM fill_events_2
            WHERE fill_events_2.contract = $/contract/
              AND fill_events_2.timestamp <= $/timestamp/
              AND fill_events_2.timestamp > $/timestamp/ - $/timestampRange/
              AND fill_events_2.order_kind != 'mint'
            ORDER BY fill_events_2.timestamp DESC
          `,
          {
            contract: toBuffer(details.data.contract),
            timestamp: details.data.toTimestamp,
            timestampRange,
          }
        );

        if (tmpResult.length) {
          // Then fetch all sales across all relevant transactions
          // THIS IS IMPORTANT! For accurate results, we must have
          // all sales within a given transaction processed in the
          // same batch.
          results = await redb.manyOrNone(
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
              WHERE fill_events_2.tx_hash IN ($/txHashes:list/)
            `,
            {
              txHashes: tmpResult.map((r) => r.tx_hash),
            }
          );
        }
      } else {
        results = await redb.manyOrNone(
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
            WHERE fill_events_2.tx_hash = $/txHash/
          `,
          {
            txHash: toBuffer(details.data.txHash),
          }
        );
      }

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
          await blockCheckJob.addBulk(
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

      const traces = await fetchTransactionTraces(
        Object.keys(fillEventsPerTxHash),
        process.env.BACKFILL_NETWORK_HTTP_URL
          ? new StaticJsonRpcProvider(process.env.BACKFILL_NETWORK_HTTP_URL, config.chainId)
          : undefined
      );
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
            paidFullRoyalty: event.paidFullRoyalty ?? undefined,
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

      if (details.kind === "all") {
        const nextBlock = details.data.toBlock - blockRange;
        if (nextBlock >= details.data.fromBlock) {
          await addToQueue({
            kind: "all",
            data: {
              fromBlock: details.data.fromBlock,
              toBlock: nextBlock,
              blockRange: details.data.blockRange,
            },
          });
        }
      } else if (details.kind === "contract") {
        const nextTimestamp = details.data.toTimestamp - timestampRange;
        if (nextTimestamp >= details.data.fromTimestamp) {
          await addToQueue({
            kind: "contract",
            data: {
              contract: details.data.contract,
              fromTimestamp: details.data.fromTimestamp,
              toTimestamp: nextTimestamp,
              timestampRange: details.data.timestampRange,
            },
          });
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

type Details =
  | {
      kind: "all";
      data: {
        fromBlock: number;
        toBlock: number;
        blockRange: number;
      };
    }
  | {
      kind: "contract";
      data: {
        contract: string;
        fromTimestamp: number;
        toTimestamp: number;
        timestampRange: number;
      };
    }
  | {
      kind: "transaction";
      data: {
        txHash: string;
      };
    };

export const addToQueue = async (details: Details) => {
  await queue.add(randomUUID(), details, {
    jobId:
      details.kind === "contract"
        ? `${details.data.fromTimestamp}-${details.data.toTimestamp}`
        : details.kind === "all"
        ? `${details.data.fromBlock}-${details.data.toBlock}`
        : undefined,
  });
};
