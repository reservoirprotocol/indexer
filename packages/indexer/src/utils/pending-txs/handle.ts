import { redis } from "@/common/redis";
import { extractOrdersFromCalldata } from "@/events-sync/handlers/royalties/calldata";
import * as es from "@/events-sync/storage";
import { PendingMessage, PendingToken } from "@/utils/pending-txs/types";

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
      await addPendingTokens(pendingTokens, txHash);
    }

    return pendingTokens;
  } catch {
    // Skip errors
  }
};

export const addPendingTokens = async (tokens: PendingToken[], txHash: string) => {
  const pipe = redis.multi();

  for (const { contract, tokenId } of tokens) {
    // Use a set to track pending tokens
    pipe.sadd(`pending-tokens:${contract}`, tokenId);

    // Set a flag to store the status
    pipe.set(`pending-token:${contract}:${tokenId}`, 1, "EX", 2 * 60);
  }

  // Link the transaction to its corresponding pending tokens
  pipe.set(`pending-tx:${txHash}`, JSON.stringify(tokens), "EX", 5 * 60);

  await pipe.exec();
};

export const setPendingTxsAsComplete = async (txHashes: string[]) => {
  try {
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
          // Remove any redis state
          pipe.srem(`pending-tokens:${contract}`, tokenId);
          pipe.del(`pending-token:${contract}:${tokenId}`);
        }

        pipe.del(`pending-tx:${txHash}`);
      }
    }

    await pipe.exec();
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

export const getContractPendingTokenIds = async (contract: string) => {
  const contractPendingTokensKey = `pending-tokens:${contract}`;
  const tokenIds = await redis.smembers(contractPendingTokensKey);

  const pipe = redis.multi();
  for (const tokenId of tokenIds) {
    pipe.get(`pending-token:${contract}:${tokenId}`);
  }
  const results = await pipe.exec();

  const expiredTokenIds: string[] = [];
  const pendingTokenIds = tokenIds.filter((tokenId, i) => {
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
      expiredTokenIds.push(tokenId);
      return false;
    }
  });

  if (expiredTokenIds.length) {
    // Clean expired items
    await redis.srem(contractPendingTokensKey, expiredTokenIds);
  }

  return pendingTokenIds;
};
