import pLimit from "p-limit";
import { config } from "@/config/index";
import * as es from "@/events-sync/storage";
import { searchForCall } from "@georgeroman/evm-tx-simulator";
import * as Sdk from "@reservoir0x/sdk";
import { redis } from "@/common/redis";
import * as utils from "@/events-sync/utils";
import { TransactionTrace } from "@/models/transaction-traces";
import { Transaction } from "@/models/transactions";
import { OrderKind } from "@/orderbook/orders";

export const allExchanges: string[] = [
  Sdk.RouterV6.Addresses.Router[config.chainId],
  Sdk.Blur.Addresses.Exchange[config.chainId],
  Sdk.SeaportV11.Addresses.Exchange[config.chainId],
  Sdk.SeaportV14.Addresses.Exchange[config.chainId],
  Sdk.Alienswap.Addresses.Exchange[config.chainId],
  Sdk.X2Y2.Addresses.Exchange[config.chainId],
  Sdk.LooksRare.Addresses.Exchange[config.chainId],
];

export async function extractAttributionInsideTx(
  tx: Pick<Transaction, "hash" | "from" | "to" | "value" | "data" | "blockTimestamp">,
  orderKind: OrderKind,
  orderId?: string,
  useCache?: boolean
) {
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

  // For Safe
  const isExecTransaction = tx.data.includes("0x6a761202");
  if (!isExecTransaction) {
    return;
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

  if (!callToAnalyze) return null;
  const realTx = {
    from: callToAnalyze.from,
    to: callToAnalyze.to,
    data: callToAnalyze.input,
  };
  const attributionData = await utils.extractAttributionDataByTransaction(realTx, orderKind, {
    orderId,
  });
  return attributionData;
}

export const assignAttributionToFillEvents = async (
  fillEvents: es.fills.Event[],
  enableCache = true
) => {
  const limit = pLimit(50);
  await Promise.all(
    fillEvents.map((fillEvent) =>
      limit(async () => {
        // Exclude mints
        if (fillEvent.orderKind === "mint") {
          return;
        }

        try {
          const tx = await utils.fetchTransaction(fillEvent.baseEventParams.txHash);
          const result = await extractAttributionInsideTx(
            tx,
            fillEvent.orderKind,
            fillEvent.orderId,
            enableCache
          );
          if (result) {
            fillEvent.aggregatorSourceId = result.aggregatorSource?.id;
            fillEvent.orderSourceId = result.orderSource?.id;
            if (result.taker) fillEvent.taker = result.taker;
            fillEvent.fillSourceId = result.fillSource?.id;
          }
        } catch {
          //   logger.error(
          //     "assign-attribution-to-fill-events",
          //     JSON.stringify({
          //       error,
          //       fillEvent,
          //     })
          //   );
        }
      })
    )
  );
};
