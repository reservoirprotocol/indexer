import { parseCallTrace } from "@georgeroman/evm-tx-simulator";

import { bn } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "zeroex-v2-fill": {
        const { args } = eventData.abi.parseLog(log);
        const maker = args["makerAddress"].toLowerCase();
        const taker = args["takerAddress"].toLowerCase();
        let transferredTokensCounter = 0;
        let amount = "";
        let tokenContract = "";
        let tokenId = "";
        let currencyKey = "";
        let currency = "";
        let currencyPrice = "";

        const txTrace = await utils.fetchTransactionTrace(baseEventParams.txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        const parsedTrace = parseCallTrace(txTrace.calls);

        for (const token of Object.keys(parsedTrace[taker].tokenBalanceState)) {
          if (token.startsWith("erc721") || token.startsWith("erc1155")) {
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

        const orderSide = bn(amount).gt(0) ? "sell" : "buy";
        currencyPrice = bn(parsedTrace[taker].tokenBalanceState[currencyKey]).abs().toString();
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

        const orderKind = "zeroex-v2";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        onChainData.fillEvents.push({
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

        onChainData.fillInfos.push({
          context: `zeroex-v2-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
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
};
