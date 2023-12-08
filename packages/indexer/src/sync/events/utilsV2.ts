import { AddressZero } from "@ethersproject/constants";
import { bn } from "@/common/utils";

import { baseProvider } from "@/common/provider";

import { saveTransactionsV2 } from "@/models/transactions";

import { BlockWithTransactions } from "@ethersproject/abstract-provider";
import { logger } from "@/common/logger";
import { TransactionTrace } from "@/models/transaction-traces";
import { CallTrace } from "@georgeroman/evm-tx-simulator/dist/types";
import { collectionNewContractDeployedJob } from "@/jobs/collections/collection-contract-deployed";
import { config } from "@/config/index";

const chainsWithoutCallTracer = [324];

export type ContractAddress = {
  address: string;
  deploymentTxHash: string;
  deploymentSender: string;
  deploymentFactory: string;
  bytecode: string;
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
