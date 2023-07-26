import { Interface } from "@ethersproject/abi";
import { HashZero } from "@ethersproject/constants";
import { searchForCall } from "@georgeroman/evm-tx-simulator";
import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";
import { getRouters } from "@/utils/routers";

import BlurAbi from "@reservoir0x/sdk/dist/blur/abis/Exchange.json";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // For keeping track of all individual trades per transaction
  const trades = {
    order: new Map<string, number>(),
  };

  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "blur-orders-matched": {
        const { args } = eventData.abi.parseLog(log);
        const sell = args.sell;
        const sellHash = args.sellHash.toLowerCase();
        const buyHash = args.buyHash.toLowerCase();
        let maker = args.maker.toLowerCase();
        let taker = args.taker.toLowerCase();

        const txHash = baseEventParams.txHash;

        const txTrace = await utils.fetchTransactionTrace(txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        const exchange = new Sdk.Blur.Exchange(config.chainId);
        const exchangeAddress = exchange.contract.address;

        const executeSigHash1 = "0x9a1fc3a7";
        const executeSigHash2 = "0xe04d94ae";

        const tradeRank = trades.order.get(`${txHash}-${exchangeAddress}`) ?? 0;
        const executeCallTraceCall = searchForCall(
          txTrace.calls,
          { to: exchangeAddress, type: "CALL", sigHashes: [executeSigHash1] },
          tradeRank
        );
        const executeCallTraceDelegate = searchForCall(
          txTrace.calls,
          { to: exchangeAddress, type: "DELEGATECALL", sigHashes: [executeSigHash2] },
          tradeRank
        );

        let isDelegateCall = false;
        if (!executeCallTraceCall && executeCallTraceDelegate) {
          isDelegateCall = true;
        }

        // Fallback
        const executeCallTrace = executeCallTraceCall || executeCallTraceDelegate;

        let orderSide: "sell" | "buy" = "sell";
        const routers = await getRouters();

        if (executeCallTrace) {
          const iface = new Interface(BlurAbi);

          const inputData = isDelegateCall
            ? iface.decodeFunctionData("_execute", executeCallTrace.input)
            : exchange.contract.interface.decodeFunctionData("execute", executeCallTrace.input);

          const sellInput = inputData.sell;
          const buyInput = inputData.buy;

          // Determine if the input has signature
          const isSellOrder = sellInput.order.side === 1 && sellInput.s != HashZero;
          const traderOfSell = sellInput.order.trader.toLowerCase();
          const traderOfBuy = buyInput.order.trader.toLowerCase();

          orderSide = isSellOrder ? "sell" : "buy";
          maker = isSellOrder ? traderOfSell : traderOfBuy;
          taker = isSellOrder ? traderOfBuy : traderOfSell;

          const callFromBlend =
            executeCallTraceCall?.from === Sdk.Blend.Addresses.Blend[config.chainId];
          if (callFromBlend) {
            taker = (await utils.fetchTransaction(baseEventParams.txHash)).from.toLowerCase();
          }
        }

        if (routers.get(maker)) {
          maker = sell.trader.toLowerCase();
        }
        if (taker === Sdk.Blend.Addresses.Blend[config.chainId]) {
          taker = (await utils.fetchTransaction(baseEventParams.txHash)).from.toLowerCase();
        }

        // Handle: attribution
        const orderKind = "blur";
        const orderId = orderSide === "sell" ? sellHash : buyHash;
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        // Handle: prices
        const currency =
          sell.paymentToken.toLowerCase() === Sdk.Blur.Addresses.Beth[config.chainId]
            ? Sdk.Common.Addresses.Native[config.chainId]
            : sell.paymentToken.toLowerCase();
        const currencyPrice = sell.price.div(sell.amount).toString();

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        onChainData.orderInfos.push({
          context: `filled-${orderId}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        onChainData.fillEvents.push({
          orderKind,
          orderId,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: sell.collection.toLowerCase(),
          tokenId: sell.tokenId.toString(),
          amount: sell.amount.toString(),
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        onChainData.fillInfos.push({
          context: `${orderId}-${baseEventParams.txHash}`,
          orderId: orderId,
          orderSide,
          contract: sell.collection.toLowerCase(),
          tokenId: sell.tokenId.toString(),
          amount: sell.amount.toString(),
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });

        trades.order.set(`${txHash}-${exchangeAddress}`, tradeRank + 1);

        break;
      }

      case "blur-order-cancelled": {
        const { args } = eventData.abi.parseLog(log);
        const orderId = args.hash.toLowerCase();

        onChainData.cancelEvents.push({
          orderKind: "blur",
          orderId,
          baseEventParams,
        });

        onChainData.orderInfos.push({
          context: `cancelled-${orderId}`,
          id: orderId,
          trigger: {
            kind: "cancel",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
            logIndex: baseEventParams.logIndex,
            batchIndex: baseEventParams.batchIndex,
            blockHash: baseEventParams.blockHash,
          },
        });

        break;
      }

      case "blur-nonce-incremented": {
        const { args } = eventData.abi.parseLog(log);
        const maker = args.trader.toLowerCase();
        const nonce = args.newNonce.toString();

        onChainData.bulkCancelEvents.push({
          orderKind: "blur",
          maker,
          minNonce: nonce,
          baseEventParams,
        });

        break;
      }
    }
  }
};
