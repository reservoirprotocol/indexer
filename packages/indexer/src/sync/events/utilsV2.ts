import { AddressZero } from "@ethersproject/constants";
import { bn } from "@/common/utils";

import { baseProvider } from "@/common/provider";

import { saveTransactionsV3 } from "@/models/transactions";
import { TransactionReceipt } from "@ethersproject/providers";

import { BlockWithTransactions } from "@ethersproject/abstract-provider";

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
      status: txReceipt.status,
      transactionIndex: txReceipt.transactionIndex,
    };
  });

  // Save all transactions within the block
  await saveTransactionsV3(transactions);
};

export const getTracesFromBlock = async (blockNumber: number) => {
  const traces = await baseProvider.send("debug_traceBlockByNumber", [
    blockNumber,
    { tracer: "callTracer" },
  ]);
  return traces;
};

export const getTransactionReceiptsFromBlock = async (blockNumber: number) => {
  const receipts = await baseProvider.send("eth_getBlockReceipts", [blockNumber]);
  return receipts;
};
