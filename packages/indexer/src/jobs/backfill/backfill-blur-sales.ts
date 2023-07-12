/* eslint-disable @typescript-eslint/no-explicit-any */

import { Interface } from "@ethersproject/abi";
import { HashZero } from "@ethersproject/constants";
import { searchForCall } from "@georgeroman/evm-tx-simulator";
import * as Sdk from "@reservoir0x/sdk";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/events-sync/utils";
import { getRouters } from "@/utils/routers";

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
            fill_events_2.log_index
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
        const _executeSigHash = "0xe04d94ae";
        let isDelegateCall = false;

        const tradeRank = trades.order.get(`${txHash}-${exchangeAddress}`) ?? 0;
        const executeCallTraceCall = searchForCall(
          txTrace.calls,
          { to: exchangeAddress, type: "CALL", sigHashes: [executeSigHash] },
          tradeRank
        );
        const executeCallTraceDelegate = searchForCall(
          txTrace.calls,
          { to: exchangeAddress, type: "DELEGATECALL", sigHashes: [_executeSigHash] },
          tradeRank
        );

        if (!executeCallTraceCall && executeCallTraceDelegate) {
          isDelegateCall = true;
        }

        // Fallback
        const executeCallTrace = executeCallTraceCall || executeCallTraceDelegate;

        realOrderSide = "sell";
        const routers = await getRouters();

        if (executeCallTrace) {
          // TODO: Update the SDK Blur contract ABI
          const iface = new Interface([
            {
              inputs: [
                {
                  components: [
                    {
                      components: [
                        {
                          internalType: "address",
                          name: "trader",
                          type: "address",
                        },
                        {
                          internalType: "enum Side",
                          name: "side",
                          type: "uint8",
                        },
                        {
                          internalType: "address",
                          name: "matchingPolicy",
                          type: "address",
                        },
                        {
                          internalType: "address",
                          name: "collection",
                          type: "address",
                        },
                        {
                          internalType: "uint256",
                          name: "tokenId",
                          type: "uint256",
                        },
                        {
                          internalType: "uint256",
                          name: "amount",
                          type: "uint256",
                        },
                        {
                          internalType: "address",
                          name: "paymentToken",
                          type: "address",
                        },
                        {
                          internalType: "uint256",
                          name: "price",
                          type: "uint256",
                        },
                        {
                          internalType: "uint256",
                          name: "listingTime",
                          type: "uint256",
                        },
                        {
                          internalType: "uint256",
                          name: "expirationTime",
                          type: "uint256",
                        },
                        {
                          components: [
                            {
                              internalType: "uint16",
                              name: "rate",
                              type: "uint16",
                            },
                            {
                              internalType: "address payable",
                              name: "recipient",
                              type: "address",
                            },
                          ],
                          internalType: "struct Fee[]",
                          name: "fees",
                          type: "tuple[]",
                        },
                        {
                          internalType: "uint256",
                          name: "salt",
                          type: "uint256",
                        },
                        {
                          internalType: "bytes",
                          name: "extraParams",
                          type: "bytes",
                        },
                      ],
                      internalType: "struct Order",
                      name: "order",
                      type: "tuple",
                    },
                    {
                      internalType: "uint8",
                      name: "v",
                      type: "uint8",
                    },
                    {
                      internalType: "bytes32",
                      name: "r",
                      type: "bytes32",
                    },
                    {
                      internalType: "bytes32",
                      name: "s",
                      type: "bytes32",
                    },
                    {
                      internalType: "bytes",
                      name: "extraSignature",
                      type: "bytes",
                    },
                    {
                      internalType: "enum SignatureVersion",
                      name: "signatureVersion",
                      type: "uint8",
                    },
                    {
                      internalType: "uint256",
                      name: "blockNumber",
                      type: "uint256",
                    },
                  ],
                  internalType: "struct Input",
                  name: "sell",
                  type: "tuple",
                },
                {
                  components: [
                    {
                      components: [
                        {
                          internalType: "address",
                          name: "trader",
                          type: "address",
                        },
                        {
                          internalType: "enum Side",
                          name: "side",
                          type: "uint8",
                        },
                        {
                          internalType: "address",
                          name: "matchingPolicy",
                          type: "address",
                        },
                        {
                          internalType: "address",
                          name: "collection",
                          type: "address",
                        },
                        {
                          internalType: "uint256",
                          name: "tokenId",
                          type: "uint256",
                        },
                        {
                          internalType: "uint256",
                          name: "amount",
                          type: "uint256",
                        },
                        {
                          internalType: "address",
                          name: "paymentToken",
                          type: "address",
                        },
                        {
                          internalType: "uint256",
                          name: "price",
                          type: "uint256",
                        },
                        {
                          internalType: "uint256",
                          name: "listingTime",
                          type: "uint256",
                        },
                        {
                          internalType: "uint256",
                          name: "expirationTime",
                          type: "uint256",
                        },
                        {
                          components: [
                            {
                              internalType: "uint16",
                              name: "rate",
                              type: "uint16",
                            },
                            {
                              internalType: "address payable",
                              name: "recipient",
                              type: "address",
                            },
                          ],
                          internalType: "struct Fee[]",
                          name: "fees",
                          type: "tuple[]",
                        },
                        {
                          internalType: "uint256",
                          name: "salt",
                          type: "uint256",
                        },
                        {
                          internalType: "bytes",
                          name: "extraParams",
                          type: "bytes",
                        },
                      ],
                      internalType: "struct Order",
                      name: "order",
                      type: "tuple",
                    },
                    {
                      internalType: "uint8",
                      name: "v",
                      type: "uint8",
                    },
                    {
                      internalType: "bytes32",
                      name: "r",
                      type: "bytes32",
                    },
                    {
                      internalType: "bytes32",
                      name: "s",
                      type: "bytes32",
                    },
                    {
                      internalType: "bytes",
                      name: "extraSignature",
                      type: "bytes",
                    },
                    {
                      internalType: "enum SignatureVersion",
                      name: "signatureVersion",
                      type: "uint8",
                    },
                    {
                      internalType: "uint256",
                      name: "blockNumber",
                      type: "uint256",
                    },
                  ],
                  internalType: "struct Input",
                  name: "buy",
                  type: "tuple",
                },
              ],
              name: "_execute",
              outputs: [],
              stateMutability: "payable",
              type: "function",
            },
          ]);

          const inputData = isDelegateCall
            ? iface.decodeFunctionData("_execute", executeCallTrace.input)
            : exchange.contract.interface.decodeFunctionData("execute", executeCallTrace.input);

          const sellInput = inputData.sell;
          const buyInput = inputData.buy;

          // Determine if the input has signature
          const isSellOrder = sellInput.order.side === 1 && sellInput.s != HashZero;
          const traderOfSell = sellInput.order.trader.toLowerCase();
          const traderOfBuy = buyInput.order.trader.toLowerCase();

          realOrderSide = isSellOrder ? "sell" : "buy";
          realMaker = isSellOrder ? traderOfSell : traderOfBuy;
          realTaker = isSellOrder ? traderOfBuy : traderOfSell;

          if (routers.get(realMaker)) {
            realMaker = traderOfSell;
          }
        }

        trades.order.set(`${txHash}-${exchangeAddress}`, tradeRank + 1);

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

      if (block >= 15000000) {
        await addToQueue(block - batchSize);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (block: number) => {
  await queue.add(randomUUID(), { block }, { jobId: block.toString() });
};
