import { redis } from "@/common/redis";
import { extractOrdersFromCalldata } from "@/events-sync/handlers/royalties/calldata";
import * as es from "@/events-sync/storage";
import { PendingItem, PendingMessage, PendingToken } from "@/utils/pending-txs/types";
import {
  pendingTxWebsocketEventsTriggerQueueJob,
  PendingTxWebsocketEventsTriggerQueueJobPayload,
} from "@/jobs/websocket-events/pending-tx-websocket-events-trigger-job";

export const handlePendingMessage = async (message: PendingMessage) => {
  try {
    const { txContents, txHash } = message;

    // Parse pending tokens from the calldata of pending transactions
    const parsedOrders = await extractOrdersFromCalldata(txContents.input);
    const pendingTokens = parsedOrders
      .map((c) => {
        return {
          contract: c.contract,
          tokenId: c.tokenId,
        };
      })
      .filter((c) => c.tokenId) as PendingToken[];

    if (pendingTokens.length) {
      await addPendingItems(pendingTokens, txHash);
    }

    return pendingTokens;
  } catch {
    // Skip errors
  }
};

export const addPendingItems = async (tokens: PendingToken[], txHash: string) => {
  const pipe = redis.multi();
  const events: PendingTxWebsocketEventsTriggerQueueJobPayload[] = [];
  for (const { contract, tokenId } of tokens) {
    const pendingItem = {
      contract,
      tokenId,
      txHash,
    } as PendingItem;

    // Use a set to track pending tokens (globally and per contract)
    pipe.sadd("pending-items", JSON.stringify(pendingItem));
    pipe.sadd(`pending-items:${contract}`, JSON.stringify(pendingItem));

    // Set a flag to store the status
    pipe.set(`pending-item:${contract}:${tokenId}:${txHash}`, 1, "EX", 2 * 60);

    events.push({
      data: {
        trigger: "created",
        item: pendingItem,
      },
    });
  }

  // Link the transaction to its corresponding pending tokens
  pipe.set(`pending-tx:${txHash}`, JSON.stringify(tokens), "EX", 5 * 60);

  await Promise.all([pendingTxWebsocketEventsTriggerQueueJob.addToQueue(events), pipe.exec()]);
};

export const setPendingTxsAsComplete = async (txHashes: string[]) => {
  try {
    const events: PendingTxWebsocketEventsTriggerQueueJobPayload[] = [];
    const pendingTokensKeys = txHashes.map((txHash) => `pending-tx:${txHash}`);
    const allPendingTokens = await redis
      .mget(pendingTokensKeys)
      .then((c) => c.map((d) => (d ? (JSON.parse(d) as PendingToken[]) : [])));
    if (allPendingTokens.every((c) => !c.length)) {
      return;
    }

    const pipe = redis.multi();
    for (let i = 0; i < allPendingTokens.length; i++) {
      const pendingTokens = allPendingTokens[i];

      const txHash = txHashes[i];
      if (pendingTokens.length) {
        for (const { contract, tokenId } of pendingTokens) {
          const pendingItem = {
            contract,
            tokenId,
            txHash,
          } as PendingItem;

          // Remove any Redis state
          pipe.srem("pending-items", JSON.stringify(pendingItem));
          pipe.srem(`pending-items:${contract}`, JSON.stringify(pendingItem));
          pipe.del(`pending-item:${contract}:${tokenId}:${txHash}`);
          events.push({
            data: {
              trigger: "deleted",
              item: pendingItem,
            },
          });
        }

        pipe.del(`pending-tx:${txHash}`);
      }
    }

    await Promise.all([pendingTxWebsocketEventsTriggerQueueJob.addToQueue(events), pipe.exec()]);
  } catch {
    // Skip errors
  }
};

export const onFillEventsCallback = async (fillEvents: es.fills.Event[]) => {
  try {
    const txHashes = Array.from(new Set(fillEvents.map((c) => c.baseEventParams.txHash)));
    await setPendingTxsAsComplete(txHashes);
  } catch {
    // Skip errors
  }
};

export const getPendingItems = async (contract?: string) => {
  const pendingItemsKey = contract ? `pending-items:${contract}` : "pending-items";

  // Get all cached pending items
  const pendingItems: PendingItem[] = await redis
    .smembers(pendingItemsKey)
    .then((rs) => rs.map((r) => JSON.parse(r)));

  // Get the status of the caches pending items
  const pipe = redis.multi();
  for (const pendingItem of pendingItems) {
    pipe.get(`pending-item:${pendingItem.contract}:${pendingItem.tokenId}:${pendingItem.txHash}`);
  }
  const results = await pipe.exec();

  // Keep track of expired vs active pending items
  const expiredPendingItem: PendingItem[] = [];
  const activePendingItems = pendingItems.filter((pendingItem, i) => {
    if (!results[i]) {
      return false;
    }

    const [error, result] = results[i];
    if (error) {
      return false;
    }

    if (result) {
      return true;
    } else {
      expiredPendingItem.push(pendingItem);
      return false;
    }
  });

  if (expiredPendingItem.length) {
    // Clean expired items
    await redis.srem(
      pendingItemsKey,
      expiredPendingItem.map((item) => JSON.stringify(item))
    );
  }

  return activePendingItems;
};
