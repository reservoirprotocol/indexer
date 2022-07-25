import { AddressZero } from "@ethersproject/constants";
import pLimit from "p-limit";

import { baseProvider, slowProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { getBlocks, saveBlock } from "@/models/blocks";
import { getTransaction, saveTransaction } from "@/models/transactions";
import { logger } from "@/common/logger";

export const fetchBlock = async (blockNumber: number) =>
  getBlocks(blockNumber)
    // Only fetch a single block (multiple ones might be available due to reorgs)
    .then(async (blocks) => {
      if (blocks.length) {
        return blocks[0];
      } else {
        const block = await baseProvider.getBlockWithTransactions(blockNumber);

        // Save all transactions within the block
        const limit = pLimit(20);
        await Promise.all(
          block.transactions.map((tx) =>
            limit(async () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const rawTx = tx.raw as any;

              const gasPrice = tx.gasPrice?.toString();
              const gasUsed = rawTx?.gas ? bn(rawTx.gas).toString() : undefined;
              const gasFee = gasPrice && gasUsed ? bn(gasPrice).mul(gasUsed).toString() : undefined;

              await saveTransaction({
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
              });
            })
          )
        );

        return saveBlock({
          number: block.number,
          hash: block.hash,
          timestamp: block.timestamp,
        });
      }
    });

export const fetchTransaction = async (txHash: string) =>
  getTransaction(txHash).catch(async () => {
    // TODO: This should happen very rarely since all transactions
    // should be readily available. The only case when data misses
    // is when a block reorg happens and the replacing block takes
    // in transactions that were missing in the previous block. In
    // this case we don't refetch the new block's transactions but
    // assume it cannot include new transactions. But that's not a
    // a good assumption so we should force re-fetch the new block
    // together with its transactions when a reorg happens.

    // In order to get all transaction fields we need to make two calls:
    // - `eth_getTransactionByHash`
    // - `eth_getTransactionReceipt`

    logger.info("debug", `Fetching tx ${txHash}`);

    let tx = await baseProvider.getTransaction(txHash);
    if (!tx) {
      tx = await slowProvider.getTransaction(txHash);
    }

    logger.info("debug", `Got tx: ${JSON.stringify(tx)}`);

    const blockTimestamp = (await fetchBlock(tx.blockNumber!)).timestamp;

    // TODO: Fetch gas fields via `eth_getTransactionReceipt`
    // Sometimes `effectiveGasPrice` can be null
    // const txReceipt = await baseProvider.getTransactionReceipt(txHash);
    // const gasPrice = txReceipt.effectiveGasPrice || tx.gasPrice || 0;

    return saveTransaction({
      hash: tx.hash.toLowerCase(),
      from: tx.from.toLowerCase(),
      to: (tx.to || AddressZero).toLowerCase(),
      value: tx.value.toString(),
      data: tx.data.toLowerCase(),
      blockNumber: tx.blockNumber!,
      blockTimestamp,
      // gasUsed: txReceipt.gasUsed.toString(),
      // gasPrice: gasPrice.toString(),
      // gasFee: txReceipt.gasUsed.mul(gasPrice).toString(),
    });
  });
