import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getTxTraces } from "@georgeroman/evm-tx-simulator";
import { getSourceV1 } from "@reservoir0x/sdk/dist/utils";
import _ from "lodash";

import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { extractNestedTx } from "@/events-sync/handlers/attribution";
import { getBlocks, saveBlock } from "@/models/blocks";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import {
  Transaction,
  getTransaction,
  saveTransaction,
  saveTransactions,
} from "@/models/transactions";
import { getTransactionLogs, saveTransactionLogs } from "@/models/transaction-logs";
import { getTransactionTraces, saveTransactionTraces } from "@/models/transaction-traces";
import { OrderKind, getOrderSourceByOrderId, getOrderSourceByOrderKind } from "@/orderbook/orders";
import { getRouters } from "@/utils/routers";

export const fetchBlock = async (blockNumber: number, force = false) => {
  if (!force) {
    const blocks = await getBlocks(blockNumber);
    if (blocks.length) {
      return blocks[0];
    }
  }

  const block = await baseProvider.getBlockWithTransactions(blockNumber);

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
  await saveTransactions(transactions);

  return saveBlock({
    number: block.number,
    hash: block.hash,
    timestamp: block.timestamp,
  });
};

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
    }
    fillSource = await sources.getOrInsert(source);
  } else if (router) {
    fillSource = router;
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
