import { searchForCall } from "@georgeroman/evm-tx-simulator";
import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { redis } from "@/common/redis";
import * as utils from "@/events-sync/utils";
import { Transaction } from "@/models/transactions";
import { TransactionTrace } from "@/models/transaction-traces";

// Router should be the top of the list
export const allExchanges: string[] = [
  Sdk.RouterV6.Addresses.Router[config.chainId],
  Sdk.Blur.Addresses.Exchange[config.chainId],
  Sdk.SeaportV11.Addresses.Exchange[config.chainId],
  Sdk.SeaportV14.Addresses.Exchange[config.chainId],
  Sdk.Alienswap.Addresses.Exchange[config.chainId],
  Sdk.X2Y2.Addresses.Exchange[config.chainId],
  Sdk.LooksRare.Addresses.Exchange[config.chainId],
];

export async function extractNestedTx(
  tx: Pick<Transaction, "hash" | "from" | "to" | "data">,
  useCache?: boolean
) {
  // Handle Gnosis Safe executions
  const isExecTransaction = tx.data.includes("0x6a761202");
  if (!isExecTransaction) {
    return null;
  }

  const txHash = tx.hash;

  // Fetch the current transaction's trace
  let txTrace: TransactionTrace | undefined;
  const cacheKeyTrace = `fetch-transaction-trace:${txHash}`;
  if (useCache) {
    const result = await redis.get(cacheKeyTrace);
    if (result) {
      txTrace = JSON.parse(result) as TransactionTrace;
    }
  }

  if (!txTrace) {
    txTrace = await utils.fetchTransactionTrace(txHash);
    if (useCache) {
      await redis.set(cacheKeyTrace, JSON.stringify(txTrace), "EX", 10 * 60);
    }
  }

  if (!txTrace) {
    return null;
  }

  let callToAnalyze = null;
  for (let index = 0; index < allExchanges.length; index++) {
    const exchangeAddress = allExchanges[index];
    const exchangeCall = searchForCall(txTrace.calls, { to: exchangeAddress }, 0);
    if (exchangeCall) {
      callToAnalyze = exchangeCall;
      break;
    }
  }

  if (!callToAnalyze) {
    return null;
  }

  return {
    hash: tx.hash,
    from: callToAnalyze.from,
    to: callToAnalyze.to,
    data: callToAnalyze.input,
  };
}
