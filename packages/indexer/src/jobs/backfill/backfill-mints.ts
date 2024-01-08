/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import pLimit from "p-limit";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { bn, fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { BaseEventParams } from "@/events-sync/parser";
import * as syncEventsUtils from "@/events-sync/utils";
import * as es from "@/events-sync/storage";
import { getOrderSourceByOrderKind } from "@/orderbook/orders";
import { getUSDAndNativePrices } from "@/utils/prices";

const QUEUE_NAME = "backfill-mints";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
    },
    removeOnComplete: 10000,
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

      const numBlocks = 20;
      const results = await idb.manyOrNone(
        `
          SELECT
            nft_transfer_events.*
          FROM nft_transfer_events
          WHERE nft_transfer_events.block < $/endBlock/
            AND nft_transfer_events.block >= $/startBlock/
            AND nft_transfer_events.is_deleted = 0
          ORDER BY nft_transfer_events.block DESC
        `,
        {
          startBlock: block - numBlocks,
          endBlock: block,
        }
      );

      const mintedTokens = new Map<
        string,
        {
          contract: string;
          from: string;
          to: string;
          tokenId: string;
          amount: string;
          baseEventParams: BaseEventParams;
        }[]
      >();

      const ns = getNetworkSettings();
      const limit = pLimit(5);

      await Promise.all(
        results.map((result) =>
          limit(() => {
            // eslint-disable-next-line
            // @ts-ignore
            const baseEventParams: BaseEventParams = {
              address: fromBuffer(result.address),
              block: result.block,
              blockHash: fromBuffer(result.block_hash),
              txHash: fromBuffer(result.tx_hash),
              txIndex: result.tx_index,
              logIndex: result.log_index,
              timestamp: result.timestamp,
              batchIndex: result.batch_index,
            };
            const from = fromBuffer(result.from);
            const to = fromBuffer(result.to);
            const tokenId = result.token_id;
            const amount = result.amount;

            if (from !== AddressZero) {
              return;
            }

            if (!ns.mintsAsSalesBlacklist.includes(baseEventParams.address)) {
              if (!mintedTokens.has(baseEventParams.txHash)) {
                mintedTokens.set(baseEventParams.txHash, []);
              }
              mintedTokens.get(baseEventParams.txHash)!.push({
                contract: baseEventParams.address,
                tokenId,
                from,
                to,
                amount,
                baseEventParams,
              });
            }
          })
        )
      );

      const fillEvents: es.fills.Event[] = [];
      await Promise.all(
        [...mintedTokens.entries()].map(async ([txHash, mints]) => {
          if (mints.length) {
            const tx = await syncEventsUtils.fetchTransaction(txHash);

            // Skip free mints
            if (tx.value === "0") {
              return;
            }

            const totalAmount = mints
              .map(({ amount }) => amount)
              .reduce((a, b) => bn(a).add(b).toString());
            if (totalAmount === "0") {
              return;
            }

            // Fix transaction values which contain decimals
            if (tx.value.includes(".")) {
              tx.value = tx.value.split(".")[0];
            }

            const price = bn(tx.value).div(totalAmount).toString();
            const currency = Sdk.Common.Addresses.Native[config.chainId];

            for (const mint of mints) {
              // Handle: attribution

              const orderKind = "mint";
              const orderSource = await getOrderSourceByOrderKind(
                orderKind,
                mint.baseEventParams.address
              );

              // Handle: prices

              const priceData = await getUSDAndNativePrices(
                currency,
                price,
                mint.baseEventParams.timestamp
              );
              if (!priceData.nativePrice) {
                // We must always have the native price
                continue;
              }

              fillEvents.push({
                orderKind,
                orderSide: "sell",
                taker: mint.to,
                maker: mint.from,
                amount: mint.amount,
                currency,
                price: priceData.nativePrice,
                currencyPrice: price,
                usdPrice: priceData.usdPrice,
                contract: mint.contract,
                tokenId: mint.tokenId,
                // Mints have matching order and fill sources but no aggregator source
                orderSourceId: orderSource?.id,
                fillSourceId: orderSource?.id,
                isPrimary: true,
                baseEventParams: mint.baseEventParams,
              });
            }
          }
        })
      );

      await es.fills.addEvents(fillEvents);

      if (block - numBlocks > 0) {
        await addToQueue(block - numBlocks);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  // if (config.chainId === 1) {
  //   redlock
  //     .acquire([`${QUEUE_NAME}-lock-2`], 60 * 60 * 24 * 30 * 1000)
  //     .then(async () => {
  //       await addToQueue(15018582);
  //     })
  //     .catch(() => {
  //       // Skip on any errors
  //     });
  // }
}

export const addToQueue = async (block: number) => {
  await queue.add(
    randomUUID(),
    { block },
    {
      jobId: `${block}-2`,
      // Add some delay to avoid putting too much pressure on the database
      delay: 5 * 1000,
    }
  );
};
