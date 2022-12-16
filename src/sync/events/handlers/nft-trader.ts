import { parseCallTrace } from "@georgeroman/evm-tx-simulator";

import { bn } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";

import * as fillUpdates from "@/jobs/fill-updates/queue";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const fillEvents: es.fills.Event[] = [];
  const fillInfos: fillUpdates.FillInfo[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "nft-trader-swap": {
        const { args } = eventData.abi.parseLog(log);
        const status = args["status"];
        const taker = args["creator"].toLowerCase();

        // Statuses:
        // 0 - Opened
        // 1 - Closed
        // 2 - Canceled
        if (status !== 1) {
          break;
        }

        const txTrace = await utils.fetchTransactionTrace(baseEventParams.txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        const parsedTrace = parseCallTrace(txTrace.calls);

        let transferredTokensCounter = 0;
        let tokenId = "";
        let tokenContract = "";
        let currency = "";
        let currencyPrice = "";
        let maker = "";

        let tokenKey = "";
        let amount = "0";
        let currencyKey = "";

        for (const token of Object.keys(parsedTrace[taker].tokenBalanceState)) {
          if (token.startsWith("erc721") || token.startsWith("erc1155")) {
            tokenKey = token;
            transferredTokensCounter++;
            amount = parsedTrace[taker].tokenBalanceState[token];
            [, tokenContract, tokenId] = token.split(":");
          } else if (token.startsWith("erc20") || token.startsWith("native")) {
            currencyKey = token;
            currency = token.split(":")[1];
          }
        }

        // We don't support token for token exchange
        // We don't support bundles
        if (transferredTokensCounter !== 1) {
          break;
        }

        for (const address of Object.keys(parsedTrace).filter(
          (key) => baseEventParams.address !== key
        )) {
          for (const token of Object.keys(parsedTrace[address].tokenBalanceState)) {
            if (address !== taker && token === tokenKey) {
              maker = address;
            }
          }
        }

        // Depending on the order side we have to calculate:
        // Price when order is "sale" = taker price paid + conctract fee
        // Price when order is "buy" = maker price received + concract fee
        const orderSide = bn(amount).gt(0) ? "sell" : "buy";

        currencyPrice = bn(
          parsedTrace[orderSide === "sell" ? taker : maker].tokenBalanceState[currencyKey]
        )
          .add(bn(parsedTrace[baseEventParams.address].tokenBalanceState[currencyKey]))
          .abs()
          .toString();

        amount = bn(amount).abs().toString();

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice.toString(),
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderKind = "nft-trader";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        fillEvents.push({
          orderKind,
          currency,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: tokenContract,
          tokenId,
          amount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: `nft-trader-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide,
          contract: tokenContract,
          tokenId,
          amount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }
    }
  }

  return {
    fillEvents,
    fillInfos,
  };
};
