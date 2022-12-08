/* eslint-disable @typescript-eslint/no-explicit-any */

import { HashZero } from "@ethersproject/constants";
import { searchForCall } from "@georgeroman/evm-tx-simulator";
import * as Sdk from "@reservoir0x/sdk";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/events-sync/utils";

const QUEUE_NAME = "backfill-blur-sales";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
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
      const { block } = job.data;

      const batchSize = 50;
      const results = await idb.manyOrNone(
        `
          SELECT
            fill_events_2.block,
            fill_events_2.tx_hash,
            fill_events_2.log_index,
            fill_events_2.batch_index,
            fill_events_2.order_side,
            fill_events_2.maker,
            fill_events_2.taker,
            fill_events_2.token_id
          FROM fill_events_2
          WHERE fill_events_2.block < $/startBlock/
            AND fill_events_2.block > $/endBlock/
            AND fill_events_2.order_kind = 'blur'
          ORDER BY
            fill_events_2.block DESC,
            fill_events_2.log_index DESC
        `,
        {
          startBlock: block,
          endBlock: block - batchSize,
        }
      );

      const trades = {
        order: new Map<string, number>(),
      };
      const values: any[] = [];
      for (const result of results) {
        const txHash = fromBuffer(result.tx_hash);
        const currOrderSide = result.order_side;
        const currMaker = fromBuffer(result.maker);
        const currTaker = fromBuffer(result.taker);

        let realOrderSide = currOrderSide;
        let realMaker = currMaker;
        let realTaker = currTaker;

        const txTrace = await utils.fetchTransactionTrace(txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        const exchange = new Sdk.Blur.Exchange(config.chainId);
        const exchangeAddress = exchange.contract.address;
        const executeSigHash = "0x9a1fc3a7";

        const tradeRank = trades.order.get(`${txHash}-${exchangeAddress}`) ?? 0;
        const executeCallTrace = searchForCall(
          txTrace.calls,
          { to: exchangeAddress, type: "CALL", sigHashes: [executeSigHash] },
          tradeRank
        );

        realOrderSide = "sell";
        const routers = Sdk.Common.Addresses.Routers[config.chainId];

        if (executeCallTrace) {
          const inputData = exchange.contract.interface.decodeFunctionData(
            "execute",
            executeCallTrace.input
          );

          const sellInput = inputData.sell;
          const buyInput = inputData.buy;

          // Determine if the input has the signature
          const isSellOrder = sellInput.order.side === 1 && sellInput.s != HashZero;
          const traderOfSell = sellInput.order.trader.toLowerCase();
          const traderOfBuy = buyInput.order.trader.toLowerCase();

          realOrderSide = isSellOrder ? "sell" : "buy";
          realMaker = isSellOrder ? traderOfSell : traderOfBuy;
          realTaker = isSellOrder ? traderOfBuy : traderOfSell;

          if (realMaker in routers) {
            realMaker = traderOfSell;
          }
        }

        // Handle: attribution
        const orderKind = "blur";
        const attributionData = await utils.extractAttributionData(txHash, orderKind);

        if (attributionData.taker) {
          realTaker = attributionData.taker;
        }

        if (realOrderSide !== currOrderSide || realMaker !== currMaker || realTaker !== currTaker) {
          logger.info(
            "debug",
            `Updating blur sale: txHash=${txHash} tokenId=${result.token_id} orderSide=${realOrderSide}(${currOrderSide}), maker=${realMaker}(${currMaker}), taker=${realTaker}(${currTaker})`
          );
          values.push({
            tx_hash: result.tx_hash,
            log_index: result.log_index,
            batch_index: result.batch_index,
            order_side: realOrderSide,
            maker: toBuffer(realMaker),
            taker: toBuffer(realTaker),
          });
        }
      }

      const columns = new pgp.helpers.ColumnSet(
        ["tx_hash", "log_index", "batch_index", "order_side", "maker", "taker"],
        {
          table: "fill_events_2",
        }
      );
      if (values.length) {
        await idb.none(
          `
            UPDATE fill_events_2 SET
              order_side = x.order_side::order_side_t,
              maker = x.maker::bytea,
              taker = x.taker::bytea,
              updated_at = now()
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(tx_hash, log_index, batch_index, order_side, maker, taker)
            WHERE fill_events_2.tx_hash = x.tx_hash::BYTEA
              AND fill_events_2.log_index = x.log_index::INT
              AND fill_events_2.batch_index = x.batch_index::INT
          `
        );
      }

      await addToQueue(block - batchSize);
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  if (config.chainId === 1) {
    redlock
      .acquire([`${QUEUE_NAME}-lock-4`], 60 * 60 * 24 * 30 * 1000)
      .then(async () => {
        await addToQueue(16140000);
      })
      .catch(() => {
        // Skip on any errors
      });
  }
}

export const addToQueue = async (block: number) => {
  await queue.add(randomUUID(), { block });
};
