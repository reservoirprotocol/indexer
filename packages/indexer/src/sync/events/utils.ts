import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getTxTraces } from "@georgeroman/evm-tx-simulator";
import { getSourceV1 } from "@reservoir0x/sdk/dist/utils";
import _ from "lodash";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { extractNestedTx } from "@/events-sync/handlers/attribution";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { Transaction, getTransaction, saveTransaction } from "@/models/transactions";
import { getTransactionLogs, saveTransactionLogs } from "@/models/transaction-logs";
import { getTransactionTraces, saveTransactionTraces } from "@/models/transaction-traces";
import { OrderKind, getOrderSourceByOrderId, getOrderSourceByOrderKind } from "@/orderbook/orders";
import { getRouters } from "@/utils/routers";

import { saveTransactionsV2 } from "@/models/transactions";

import { BlockWithTransactions } from "@ethersproject/abstract-provider";
import { logger } from "@/common/logger";
import { TransactionTrace } from "@/models/transaction-traces";
import { CallTrace } from "@georgeroman/evm-tx-simulator/dist/types";
import { collectionNewContractDeployedJob } from "@/jobs/collections/collection-contract-deployed";
import { config } from "@/config/index";
import { redis } from "@/common/redis";

const chainsWithoutCallTracer = [324];

export type ContractAddress = {
  address: string;
  deploymentTxHash: string;
  deploymentSender: string;
  deploymentFactory: string;
  bytecode: string;
};

export const fetchTransaction = async (txHash: string) => {
  const redisTx = await redis.get(`tx:${txHash}`);
  if (redisTx) {
    return JSON.parse(redisTx);
  }

  // get from database
  const dbTx = await getTransaction(txHash);
  if (dbTx) {
    return dbTx;
  }

  // get from provider
  let tx = await baseProvider.getTransaction(txHash);
  if (!tx) {
    return undefined;
  }

  if (!tx.timestamp) {
    const block = await baseProvider.getBlock(tx.blockNumber!);
    tx = {
      ...tx,
      timestamp: block.timestamp,
    };
  }

  return saveTransaction({
    hash: tx.hash.toLowerCase(),
    from: tx.from.toLowerCase(),
    to: (tx.to || AddressZero).toLowerCase(),
    value: tx.value.toString(),
    data: tx.data.toLowerCase(),
    blockNumber: tx.blockNumber!,
    blockTimestamp: tx.timestamp!,
  });
};

export const fetchTransactionTraces = async (txHashes: string[], provider?: JsonRpcProvider) => {
  // Some traces might already exist
  const existingTraces = await getTransactionTraces(txHashes);
  const existingTxHashes = Object.fromEntries(existingTraces.map(({ hash }) => [hash, true]));

  // Only fetch those that don't yet exist
  const missingTxHashes = txHashes.filter((txHash) => !existingTxHashes[txHash]);
  if (missingTxHashes.length) {
    // For efficiency, fetch in multiple small batches
    const batches = _.chunk(missingTxHashes, 10);
    const missingTraces = (
      await Promise.all(
        batches.map(async (batch) => {
          const missingTraces = Object.entries(
            await getTxTraces(
              batch.map((hash) => ({ hash })),
              provider ?? baseProvider
            )
          ).map(([hash, calls]) => ({ hash, calls }));

          // Save the newly fetched traces
          await saveTransactionTraces(missingTraces);
          return missingTraces;
        })
      )
    ).flat();

    return existingTraces.concat(missingTraces);
  } else {
    return existingTraces;
  }
};

export const fetchTransactionTrace = async (txHash: string) => {
  try {
    const traces = await fetchTransactionTraces([txHash]);
    if (!traces.length) {
      return undefined;
    }

    return traces[0];
  } catch {
    return undefined;
  }
};

export const fetchTransactionLogs = async (txHash: string) =>
  getTransactionLogs(txHash).catch(async () => {
    const receipt = await baseProvider.getTransactionReceipt(txHash);

    return saveTransactionLogs({
      hash: txHash,
      logs: receipt.logs,
    });
  });

export const extractAttributionData = async (
  txHash: string,
  orderKind: OrderKind,
  options?: {
    address?: string;
    orderId?: string;
  }
) => {
  const sources = await Sources.getInstance();

  let aggregatorSource: SourcesEntity | undefined;
  let fillSource: SourcesEntity | undefined;
  let taker: string | undefined;

  let orderSource: SourcesEntity | undefined;
  if (options?.orderId) {
    // First try to get the order's source by id
    orderSource = await getOrderSourceByOrderId(options.orderId);
  }
  if (!orderSource) {
    // Default to getting the order's source by kind
    orderSource = await getOrderSourceByOrderKind(orderKind, options?.address);
  }

  // Handle internal transactions
  let tx: Pick<Transaction, "hash" | "from" | "to" | "data"> = await fetchTransaction(txHash);
  try {
    const nestedTx = await extractNestedTx(tx, true);
    if (nestedTx) {
      tx = nestedTx;
    }
  } catch {
    // Skip errors
  }

  // Properly set the taker when filling through router contracts
  const routers = await getRouters();

  let router = routers.get(tx.to);
  if (!router) {
    // Handle cases where we transfer directly to the router when filling bids
    if (tx.data.startsWith("0xb88d4fde")) {
      const iface = new Interface([
        "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)",
      ]);
      const result = iface.decodeFunctionData("safeTransferFrom", tx.data);
      router = routers.get(result.to.toLowerCase());
    } else if (tx.data.startsWith("0xf242432a")) {
      const iface = new Interface([
        "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
      ]);
      const result = iface.decodeFunctionData("safeTransferFrom", tx.data);
      router = routers.get(result.to.toLowerCase());
    }
  }
  if (router) {
    taker = tx.from;
  }

  let source = getSourceV1(tx.data);
  if (!source) {
    const last4Bytes = "0x" + tx.data.slice(-8);
    source = sources.getByDomainHash(last4Bytes)?.domain;
  }

  // Reference: https://github.com/reservoirprotocol/core/issues/22#issuecomment-1191040945
  if (source) {
    if (source === "gem.xyz") {
      aggregatorSource = await sources.getOrInsert("gem.xyz");
    } else if (source === "blur.io") {
      aggregatorSource = await sources.getOrInsert("blur.io");
    } else if (source === "alphasharks.io") {
      aggregatorSource = await sources.getOrInsert("alphasharks.io");
    } else if (source === "magically.gg") {
      aggregatorSource = await sources.getOrInsert("magically.gg");
    } else if (router) {
      aggregatorSource = router;
    }
    fillSource = await sources.getOrInsert(source);
  } else if (router) {
    fillSource = router;
    aggregatorSource = router;
  } else {
    fillSource = orderSource;
  }

  const secondSource = sources.getByDomainHash("0x" + tx.data.slice(-16, -8));
  const viaReservoir = secondSource?.domain === "reservoir.tools";
  if (viaReservoir) {
    aggregatorSource = secondSource;
  }

  return {
    orderSource,
    fillSource,
    aggregatorSource,
    taker,
  };
};

export const fetchBlock = async (blockNumber: number) => {
  const block = await baseProvider.getBlockWithTransactions(blockNumber);
  return block;
};

export const saveBlockTransactions = async (block: BlockWithTransactions) => {
  // Create transactions array to store
  const transactions = block.transactions.map((tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawTx = tx.raw as any;

    const gasPrice = tx.gasPrice?.toString();
    const gasUsed = rawTx?.gas ? bn(rawTx.gas).toString() : undefined;
    const gasFee = gasPrice && gasUsed ? bn(gasPrice).mul(gasUsed).toString() : undefined;

    return {
      hash: tx.hash.toLowerCase(),
      from: tx.from.toLowerCase(),
      to: (tx.to || AddressZero).toLowerCase(),
      value: tx.value.toString(),
      data: tx.data.toLowerCase(),
      blockNumber: block.number,
      blockTimestamp: block.timestamp,
      gasPrice,
      gasUsed,
      gasFee,
    };
  });

  // Save all transactions within the block
  await saveTransactionsV2(transactions);
};

export const saveBlockTransactionsRedis = async (block: BlockWithTransactions) => {
  // Create transactions array to store
  const transactions = block.transactions.map((tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawTx = tx.raw as any;

    const gasPrice = tx.gasPrice?.toString();
    const gasUsed = rawTx?.gas ? bn(rawTx.gas).toString() : undefined;
    const gasFee = gasPrice && gasUsed ? bn(gasPrice).mul(gasUsed).toString() : undefined;

    return {
      hash: tx.hash.toLowerCase(),
      from: tx.from.toLowerCase(),
      to: (tx.to || AddressZero).toLowerCase(),
      value: tx.value.toString(),
      data: tx.data.toLowerCase(),
      blockNumber: block.number,
      blockTimestamp: block.timestamp,
      gasPrice,
      gasUsed,
      gasFee,
    };
  });

  // Save all transactions within the block to redis
  await Promise.all(
    transactions.map(async (tx) => {
      // This gets deletes once it gets flushed to the database
      await redis.set(`tx:${tx.hash}`, JSON.stringify(tx));
    })
  );

  // Save the block data to redis
  await redis.set(`block:${block.number}`, JSON.stringify(block));
};

export const _getTransactionTraces = async (Txs: { hash: string }[], block: number) => {
  const timerStart = Date.now();
  let traces;

  try {
    traces = (await getTracesFromBlock(block)) as TransactionTrace[];
  } catch (e) {
    logger.error(`get-transactions-traces`, `Failed to get traces from block ${block}, ${e}`);
    // traces = await getTracesFromHashes(Txs.map((tx) => tx.hash));
    // throw e;
  }

  if (!traces) {
    return {
      traces: [],
      getTransactionTracesTime: 0,
    };
  }

  // traces don't have the transaction hash, so we need to add it by using the txs array we are passing in by using the index of the trace
  traces = traces.map((trace, index) => {
    return {
      ...trace,
      hash: Txs[index].hash,
    };
  });

  traces = traces.filter((trace) => trace !== null) as TransactionTrace[];

  const timerEnd = Date.now();

  return {
    traces,
    getTransactionTracesTime: timerEnd - timerStart,
  };
};

export const getTracesFromBlock = async (blockNumber: number, retryMax = 10) => {
  let traces: TransactionTrace[] | undefined;
  let retries = 0;
  while (!traces && retries < retryMax) {
    try {
      // eslint-disable-next-line
      const params: any[] = [blockNumberToHex(blockNumber)];
      if (!chainsWithoutCallTracer.includes(config.chainId)) {
        params.push({ tracer: "callTracer" });
      }

      traces = await baseProvider.send("debug_traceBlockByNumber", params);
    } catch (e) {
      retries++;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return traces;
};

export const getTracesFromHashes = async (txHashes: string[]) => {
  const traces = await Promise.all(
    txHashes.map(async (txHash) => {
      const trace = await getTransactionTraceFromRPC(txHash);
      if (!trace) {
        logger.error("sync-events-v2", `Failed to get trace for tx: ${txHash}`);
        return null;
      }

      return {
        ...trace,
        hash: txHash,
      };
    })
  );
  return traces;
};

export const getTransactionTraceFromRPC = async (hash: string, retryMax = 10) => {
  let trace: TransactionTrace | undefined;
  let retries = 0;
  while (!trace && retries < retryMax) {
    try {
      // eslint-disable-next-line
      const params: any[] = [hash];

      if (!chainsWithoutCallTracer.includes(config.chainId)) {
        params.push({ tracer: "callTracer" });
      }
      trace = await baseProvider.send("debug_traceTransaction", params);
    } catch (e) {
      retries++;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  return trace;
};

export const blockNumberToHex = (blockNumber: number) => {
  return "0x" + blockNumber.toString(16);
};

const processCall = (trace: TransactionTrace, call: CallTrace) => {
  const processedCalls = [];
  if (
    (call.type.toUpperCase() as "CALL" | "STATICCALL" | "DELEGATECALL" | "CREATE" | "CREATE2") ===
      "CREATE" ||
    (call.type.toUpperCase() as "CALL" | "STATICCALL" | "DELEGATECALL" | "CREATE" | "CREATE2") ===
      "CREATE2"
  ) {
    processedCalls.push({
      address: call.to,
      deploymentTxHash: trace.hash,
      deploymentSender: call.from,
      deploymentFactory: call?.to || AddressZero,
      bytecode: call.input,
    });
  }

  if (call?.calls) {
    call.calls.forEach((c) => {
      const processedCall = processCall(trace, c);
      if (processedCall) {
        processedCalls.push(...processedCall);
      }
    });

    return processedCalls;
  }

  return processedCalls.length ? processedCalls : undefined;
};

export const processContractAddresses = async (
  traces: TransactionTrace[],
  blockTimestamp: number
) => {
  let contractAddresses: ContractAddress[] = [];

  for (const trace of traces) {
    // eslint-disable-next-line
    // @ts-ignore
    if (trace.result && !trace.result.error && !trace?.calls) {
      // eslint-disable-next-line
      // @ts-ignore
      const processedCall = processCall(trace, trace.result);
      if (processedCall) {
        contractAddresses.push(...processedCall);
      }
      // eslint-disable-next-line
      // @ts-ignore
    } else if (trace?.calls?.length > 0) {
      // eslint-disable-next-line
      // @ts-ignore
      trace?.calls?.forEach((call) => {
        const processedCall = processCall(trace, call);
        if (processedCall) {
          contractAddresses.push(...processedCall);
        }
      });
    }
  }

  contractAddresses = contractAddresses.filter((ca) => ca);

  contractAddresses.forEach(async (ca) => {
    collectionNewContractDeployedJob.addToQueue({
      contract: ca.address,
      deployer: ca.deploymentSender,
      blockTimestamp,
    });
  });
};
