import { AddressZero } from "@ethersproject/constants";
import { bn } from "@/common/utils";

import { baseProvider } from "@/common/provider";

import { saveTransactionsV2 } from "@/models/transactions";

import { BlockWithTransactions } from "@ethersproject/abstract-provider";

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
