import { AddressZero } from "@ethersproject/constants";
import pLimit from "p-limit";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { getBlocks, saveBlock } from "@/models/blocks";
import { saveTransaction } from "@/models/transactions";

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
              logger.info("debug", JSON.stringify(tx));

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
