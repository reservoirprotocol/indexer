import { AddressZero } from "@ethersproject/constants";
import { bn } from "@/common/utils";

import { baseProvider } from "@/common/provider";

import { saveTransactionsV2 } from "@/models/transactions";
import { TransactionReceipt } from "@ethersproject/providers";

import { BlockWithTransactions } from "@ethersproject/abstract-provider";
import { TransactionTrace } from "@/models/transaction-traces";
import { ContractAddress, saveContractAddresses } from "@/models/contract_addresses";
import { CallTrace } from "@georgeroman/evm-tx-simulator/dist/types";

export const fetchBlock = async (blockNumber: number) => {
  const block = await baseProvider.getBlockWithTransactions(blockNumber);
  return block;
};

export const saveBlockTransactions = async (
  blockData: BlockWithTransactions,
  transactionReceipts: TransactionReceipt[]
) => {
  // Create transactions array to store
  const transactions = transactionReceipts.map((txReceipt) => {
    const tx = blockData.transactions.find((t) => t.hash === txReceipt.transactionHash);
    if (!tx)
      throw new Error(
        `Could not find transaction ${txReceipt.transactionHash} in block ${blockData.number}`
      );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txRaw = tx.raw as any;
    const gasPrice = tx.gasPrice?.toString();
    const gasUsed = txRaw?.gas ? bn(txRaw.gas).toString() : undefined;
    const gasFee = gasPrice && gasUsed ? bn(gasPrice).mul(gasUsed).toString() : undefined;

    return {
      hash: tx.hash.toLowerCase(),
      from: tx.from.toLowerCase(),
      to: (tx.to || AddressZero).toLowerCase(),
      value: tx.value.toString(),
      data: tx.data.toLowerCase(),
      blockNumber: blockData.number,
      blockTimestamp: blockData.timestamp,
      gasPrice,
      gasUsed,
      gasFee,
      cumulativeGasUsed: txReceipt.cumulativeGasUsed.toString(),
      contractAddress: txReceipt.contractAddress?.toLowerCase(),
      logsBloom: txReceipt.logsBloom,
      status: txReceipt.status === 1,
      transactionIndex: txReceipt.transactionIndex,
    };
  });

  // Save all transactions within the block
  await saveTransactionsV2(transactions);
};

export const getTracesFromBlock = async (blockNumber: number) => {
  const traces = await baseProvider.send("debug_traceBlockByNumber", [
    blockNumberToHex(blockNumber),
    { tracer: "callTracer" },
  ]);
  return traces;
};

export const getTransactionReceiptsFromBlock = async (blockNumber: number) => {
  const receipts = await baseProvider.send("eth_getBlockReceipts", [blockNumberToHex(blockNumber)]);
  return receipts;
};

export const blockNumberToHex = (blockNumber: number) => {
  return "0x" + blockNumber.toString(16);
};

const processCall = (trace: TransactionTrace, call: CallTrace) => {
  const processedCalls = [];
  if (call.type === "CREATE" || call.type === "CREATE2") {
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
        processedCalls.push(processedCall);
      }
    });

    return processedCalls;
  }
};

export const processContractAddresses = async (traces: TransactionTrace[]) => {
  const contractAddresses: ContractAddress[] = [];

  for (const trace of traces) {
    trace.calls.forEach((call) => {
      const processedCall = processCall(trace, call);
      if (processedCall) {
        contractAddresses.push(...processedCall);
      }
    });
  }

  await saveContractAddresses(contractAddresses);
};
