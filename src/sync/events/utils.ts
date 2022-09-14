import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { getTxTrace } from "@georgeroman/evm-tx-simulator";
import * as Sdk from "@reservoir0x/sdk";
import { getReferrer } from "@reservoir0x/sdk/dist/utils";
import pLimit from "p-limit";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getBlocks, saveBlock } from "@/models/blocks";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { getTransaction, saveTransaction } from "@/models/transactions";
import { getTransactionLogs, saveTransactionLogs } from "@/models/transaction-logs";
import { getTransactionTrace, saveTransactionTrace } from "@/models/transaction-traces";
import { OrderKind, getOrderSourceByOrderKind } from "@/orderbook/orders";

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
      tx = await baseProvider.getTransaction(txHash);
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

export const fetchTransactionTrace = async (txHash: string) =>
  getTransactionTrace(txHash)
    .catch(async () => {
      const transactionTrace = await getTxTrace({ hash: txHash }, baseProvider);

      return saveTransactionTrace({
        hash: txHash,
        calls: transactionTrace,
      });
    })
    .catch(() => undefined);

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
  address?: string
) => {
  const sources = await Sources.getInstance();

  let aggregatorSource: SourcesEntity | undefined;
  let fillSource: SourcesEntity | undefined;
  let taker: string | undefined;

  const orderSource = await getOrderSourceByOrderKind(orderKind, address);

  // Properly set the taker when filling through router contracts
  const tx = await fetchTransaction(txHash);
  let router = Sdk.Common.Addresses.Routers[config.chainId]?.[tx.to];
  if (!router) {
    // Handle cases where we transfer directly to the router when filling bids
    if (tx.data.startsWith("0xb88d4fde")) {
      const iface = new Interface([
        "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)",
      ]);
      const result = iface.decodeFunctionData("safeTransferFrom", tx.data);
      router = Sdk.Common.Addresses.Routers[config.chainId]?.[result.to.toLowerCase()];
    } else if (tx.data.startsWith("0xf242432a")) {
      const iface = new Interface([
        "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
      ]);
      const result = iface.decodeFunctionData("safeTransferFrom", tx.data);
      router = Sdk.Common.Addresses.Routers[config.chainId]?.[result.to.toLowerCase()];
    }
  }
  if (router) {
    taker = tx.from;
  }

  const referrer = getReferrer(tx.data);

  // Reference: https://github.com/reservoirprotocol/core/issues/22#issuecomment-1191040945
  if (referrer) {
    aggregatorSource = await sources.getOrInsert("reservoir.tools");
    fillSource = await sources.getOrInsert(referrer);

    // Special rule for handling Gem filling directly on Seaport
    if (fillSource?.domain === "gem.xyz") {
      aggregatorSource = fillSource;
    }
  } else if (router === "reservoir.tools") {
    aggregatorSource = await sources.getOrInsert("reservoir.tools");
  } else if (router) {
    aggregatorSource = await sources.getOrInsert(router);
    fillSource = await sources.getOrInsert(router);
  } else {
    fillSource = orderSource;
  }

  return {
    orderSource,
    fillSource,
    aggregatorSource,
    taker,
  };
};
