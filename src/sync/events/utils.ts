import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { getReferrer } from "@reservoir0x/sdk/dist/utils";
import pLimit from "p-limit";

import { baseProvider, slowProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getBlocks, saveBlock } from "@/models/blocks";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { getTransaction, saveTransaction } from "@/models/transactions";

export const fetchBlock = async (blockNumber: number, force = false) =>
  getBlocks(blockNumber)
    // Only fetch a single block (multiple ones might be available due to reorgs)
    .then(async (blocks) => {
      if (blocks.length && !force) {
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

    let tx = await baseProvider.getTransaction(txHash);
    if (!tx) {
      tx = await slowProvider.getTransaction(txHash);
    }

    // Also fetch all transactions within the block
    const blockTimestamp = (await fetchBlock(tx.blockNumber!, true)).timestamp;

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

export const getOrderSourceByOrderKind = async (
  orderKind: string
): Promise<SourcesEntity | null> => {
  try {
    const sources = await Sources.getInstance();

    switch (orderKind) {
      case "x2y2":
        return sources.getByDomain("x2y2.io");
      case "foundation":
        return sources.getByDomain("foundation.app");
      case "looks-rare":
        return sources.getByDomain("looksrare.org");
      case "seaport":
      case "wyvern-v2":
      case "wyvern-v2.3":
        return sources.getByDomain("opensea.io");
      case "rarible":
        return sources.getByDomain("rarible.com");
      case "element-erc721":
      case "element-erc1155":
        return sources.getByDomain("element.market");
      case "quixotic":
        return sources.getByDomain("quixotic.io");
      default:
        // For all other order kinds we cannot default the source
        return null;
    }
  } catch (error) {
    return null;
  }
};

export const extractAttributionData = async (txHash: string, orderKind: string) => {
  const sources = await Sources.getInstance();

  let aggregatorSource: SourcesEntity | undefined;
  let fillSource: SourcesEntity | undefined;
  let taker: string | undefined;

  // Properly set the taker when filling through router contracts
  const tx = await fetchTransaction(txHash);
  const router = Sdk.Common.Addresses.Routers[config.chainId][tx.to];
  if (router) {
    taker = tx.from;
  }

  const referrer = getReferrer(tx.data);

  // Reference: https://github.com/reservoirprotocol/core/issues/22#issuecomment-1191040945
  if (referrer) {
    aggregatorSource = await sources.getOrInsert("reservoir.tools");
    fillSource = await sources.getOrInsert(referrer);
  } else if (router === "reservoir.tools") {
    aggregatorSource = await sources.getOrInsert("reservoir.tools");
  } else if (router) {
    aggregatorSource = await sources.getOrInsert(router);
    fillSource = await sources.getOrInsert(router);
  } else {
    const defaultSourceId = await getOrderSourceByOrderKind(orderKind);
    if (defaultSourceId) {
      fillSource = defaultSourceId;
    }
  }

  return {
    fillSource,
    aggregatorSource,
    taker,
  };
};
