import { bn } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import { getUSDAndNativePrices } from "@/utils/prices";
import * as nftxUtils from "@/utils/nftx";

import * as fillUpdates from "@/jobs/fill-updates/queue";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const fillEvents: es.fills.Event[] = [];

  const fillInfos: fillUpdates.FillInfo[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "nftx-minted": {
        const { args } = eventData.abi.parseLog(log);
        const tokenIds = args.nftIds.map(String);
        const amounts = args.amounts.map(String);

        // Determine the total quantity of NFTs sold
        let nftCount = 0;
        for (let i = 0; i < tokenIds.length; i++) {
          nftCount += amounts.length ? Number(amounts[i]) : 1;
        }

        const nftPool = await nftxUtils.getNftPoolDetails(baseEventParams.address);
        if (!nftPool) {
          // Skip any failed attempts to get the pool details
          break;
        }

        // Fetch all logs from the current transaction
        const { logs } = await utils.fetchTransactionLogs(baseEventParams.txHash);

        // Ensure there is a single `Minted` event for the same pool
        const mintEventsCount = logs.filter((log) =>
          nftxUtils.isMint(log, baseEventParams.address)
        ).length;
        if (mintEventsCount > 1) {
          break;
        }

        // Ensure there is a single `Swap` event for the same pool
        const swapEventsCount = logs.filter((log) => nftxUtils.isSwap(log)).length;
        if (swapEventsCount > 1) {
          break;
        }

        for (const log of logs) {
          const result = await nftxUtils.tryParseSwap(log);
          if (
            result &&
            // The swap occured after the mint
            log.logIndex > baseEventParams.logIndex &&
            // The swap included the nft pool token
            [result.ftPool.token0, result.ftPool.token1].includes(nftPool.address)
          ) {
            let currency: string | undefined;
            let currencyPrice: string | undefined;
            if (nftPool.address === result.ftPool.token0 && result.amount1Out !== "0") {
              currency = result.ftPool.token1;
              currencyPrice = bn(result.amount1Out).div(nftCount).toString();
            } else if (nftPool.address === result.ftPool.token1 && result.amount0Out !== "0") {
              currency = result.ftPool.token0;
              currencyPrice = bn(result.amount0Out).div(nftCount).toString();
            }

            if (currency && currencyPrice) {
              // Handle: attribution

              const orderKind = "nftx";
              const attributionData = await utils.extractAttributionData(
                baseEventParams.txHash,
                orderKind
              );

              // Handle: prices

              const priceData = await getUSDAndNativePrices(
                currency,
                currencyPrice,
                baseEventParams.timestamp
              );
              if (!priceData.nativePrice) {
                // We must always have the native price
                break;
              }

              // Always set the taker as the transaction's sender in order to cover
              // trades made through the default NFTX marketplace zap contract that
              // acts as a router
              const taker = (await utils.fetchTransaction(baseEventParams.txHash)).from;
              for (let i = 0; i < tokenIds.length; i++) {
                fillEvents.push({
                  orderKind,
                  orderSide: "buy",
                  maker: baseEventParams.address,
                  taker,
                  price: priceData.nativePrice,
                  currencyPrice,
                  usdPrice: priceData.usdPrice,
                  currency,
                  contract: nftPool.nft,
                  tokenId: tokenIds[i],
                  amount: amounts.length ? amounts[i] : "1",
                  orderSourceId: attributionData.orderSource?.id,
                  aggregatorSourceId: attributionData.aggregatorSource?.id,
                  fillSourceId: attributionData.fillSource?.id,
                  baseEventParams: {
                    ...baseEventParams,
                    batchIndex: i + 1,
                  },
                });

                fillInfos.push({
                  context: `nftx-${nftPool.nft}-${tokenIds[i]}-${baseEventParams.txHash}`,
                  orderSide: "buy",
                  contract: nftPool.nft,
                  tokenId: tokenIds[i],
                  amount: amounts.length ? amounts[i] : "1",
                  price: priceData.nativePrice,
                  timestamp: baseEventParams.timestamp,
                  maker: baseEventParams.address,
                  taker,
                });
              }
            }
          }
        }

        break;
      }

      case "nftx-redeemed": {
        const { args } = eventData.abi.parseLog(log);
        const tokenIds = args.nftIds.map(String);

        const nftPool = await nftxUtils.getNftPoolDetails(baseEventParams.address);
        if (!nftPool) {
          // Skip any failed attempts to get the pool details
          break;
        }

        // Fetch all logs from the current transaction
        const { logs } = await utils.fetchTransactionLogs(baseEventParams.txHash);

        // Ensure there is a single `Redeemed` event for the same pool
        const redeemEventsCount = logs.filter((log) =>
          nftxUtils.isRedeem(log, baseEventParams.address)
        ).length;
        if (redeemEventsCount > 1) {
          break;
        }

        // Ensure there is a single `Swap` event for the same pool
        const swapEventsCount = logs.filter((log) => nftxUtils.isSwap(log)).length;
        if (swapEventsCount > 1) {
          break;
        }

        for (const log of logs) {
          const result = await nftxUtils.tryParseSwap(log);
          if (
            result &&
            // The swap occured before the redeem
            log.logIndex < baseEventParams.logIndex &&
            // The swap included the nft pool token
            [result.ftPool.token0, result.ftPool.token1].includes(nftPool.address)
          ) {
            let currency: string | undefined;
            let currencyPrice: string | undefined;
            if (nftPool.address === result.ftPool.token0 && result.amount1In !== "0") {
              currency = result.ftPool.token1;
              currencyPrice = bn(result.amount1In).div(tokenIds.length).toString();
            } else if (nftPool.address === result.ftPool.token1 && result.amount0In !== "0") {
              currency = result.ftPool.token0;
              currencyPrice = bn(result.amount0In).div(tokenIds.length).toString();
            }

            if (currency && currencyPrice) {
              // Handle: attribution

              const orderKind = "nftx";
              const attributionData = await utils.extractAttributionData(
                baseEventParams.txHash,
                orderKind
              );

              // Handle: prices

              const priceData = await getUSDAndNativePrices(
                currency,
                currencyPrice,
                baseEventParams.timestamp
              );
              if (!priceData.nativePrice) {
                // We must always have the native price
                break;
              }

              // Always set the taker as the transaction's sender in order to cover
              // trades made through the default NFTX marketplace zap contract that
              // acts as a router
              const taker = (await utils.fetchTransaction(baseEventParams.txHash)).from;
              for (let i = 0; i < tokenIds.length; i++) {
                fillEvents.push({
                  orderKind,
                  orderSide: "sell",
                  maker: baseEventParams.address,
                  taker,
                  price: priceData.nativePrice,
                  currencyPrice,
                  usdPrice: priceData.usdPrice,
                  currency,
                  contract: nftPool.nft,
                  tokenId: tokenIds[i],
                  amount: "1",
                  orderSourceId: attributionData.orderSource?.id,
                  aggregatorSourceId: attributionData.aggregatorSource?.id,
                  fillSourceId: attributionData.fillSource?.id,
                  baseEventParams: {
                    ...baseEventParams,
                    batchIndex: i + 1,
                  },
                });

                fillInfos.push({
                  context: `nftx-${nftPool.nft}-${tokenIds[i]}-${baseEventParams.txHash}`,
                  orderSide: "sell",
                  contract: nftPool.nft,
                  tokenId: tokenIds[i],
                  amount: "1",
                  price: priceData.nativePrice,
                  timestamp: baseEventParams.timestamp,
                  maker: baseEventParams.address,
                  taker,
                });
              }
            }
          }
        }

        break;
      }
    }
  }

  return {
    fillEvents,

    fillInfos,
  };
};
