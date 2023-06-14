import { idb } from "@/common/db";
import { bn, fromBuffer } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import * as nftx from "@/orderbook/orders/nftx";
import * as nftxUtils from "@/utils/nftx";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "nftx-minted": {
        const { args } = eventData.abi.parseLog(log);
        const tokenIds = args.nftIds.map(String);
        const amounts = args.amounts.map(String);

        // Determine the total quantity of NFTs sold
        let nftCount = 0;
        for (let i = 0; i < tokenIds.length; i++) {
          // TODO: Get the amount from the corresponding transfer event
          // NFTX allows any random value to be passed in the `amounts` array
          // We cover the most common cases:
          // - correct value
          // - no value
          // - value = token id
          let amount = amounts.length ? Number(amounts[i]) : 1;
          if (String(amount) === tokenIds[i]) {
            amount = 1;
          }

          nftCount += amount;
        }

        const nftPool = await nftxUtils.getNftPoolDetails(baseEventParams.address);
        if (!nftPool) {
          // Skip any failed attempts to get the pool details
          break;
        }

        onChainData.orders.push({
          kind: "nftx",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
            },
            metadata: {},
          },
        });

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
        if (swapEventsCount > 2) {
          break;
        }

        const totalSwaps = [];

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

            if (currencyPrice && currency) {
              totalSwaps.push({
                currency,
                currencyPrice,
              });
            }
          }
        }

        if (!totalSwaps.length) {
          break;
        }

        const currency = totalSwaps[0].currency;
        const sameCurrency = totalSwaps.every((c) => c.currency === currency);
        const currencyPrice = totalSwaps
          .reduce((total, c) => total.add(bn(c.currencyPrice)), bn(0))
          .toString();

        if (currency && currencyPrice && sameCurrency) {
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
            const tokenId = tokenIds[i];
            const orderId = nftx.getOrderId(baseEventParams.address, "buy");

            onChainData.fillEventsPartial.push({
              orderKind,
              orderSide: "buy",
              orderId,
              maker: baseEventParams.address,
              taker,
              price: priceData.nativePrice,
              currencyPrice,
              usdPrice: priceData.usdPrice,
              currency,
              contract: nftPool.nft,
              tokenId,
              amount: amounts.length ? amounts[i] : "1",
              orderSourceId: attributionData.orderSource?.id,
              aggregatorSourceId: attributionData.aggregatorSource?.id,
              fillSourceId: attributionData.fillSource?.id,
              baseEventParams: {
                ...baseEventParams,
                batchIndex: i + 1,
              },
            });

            onChainData.fillInfos.push({
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

            onChainData.orderInfos.push({
              context: `filled-${orderId}-${baseEventParams.txHash}`,
              id: orderId,
              trigger: {
                kind: "sale",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
            });
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

        onChainData.orders.push({
          kind: "nftx",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
            },
            metadata: {},
          },
        });

        // Handle: attribution
        const orderKind = "nftx";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        // Always set the taker as the transaction's sender in order to cover
        // trades made through the default NFTX marketplace zap contract that
        // acts as a router
        const taker = (await utils.fetchTransaction(baseEventParams.txHash)).from;

        // Fetch all logs from the current transaction
        const { logs } = await utils.fetchTransactionLogs(baseEventParams.txHash);

        const redeemEventsCount = logs.filter((log) =>
          nftxUtils.isRedeem(log, baseEventParams.address)
        ).length;

        const swapEventsCount = logs.filter((log) => nftxUtils.isSwap(log)).length;

        if (swapEventsCount > 2 || redeemEventsCount > 1) {
          // Fill all related sell orders
          const orderIds = tokenIds.map((tokenId: string) =>
            nftx.getOrderId(baseEventParams.address, "sell", tokenId)
          );
          const dbOrders = await idb.manyOrNone(
            `
              SELECT
                orders.id,
                orders.currency,
                orders.price,
                orders.updated_at
              FROM orders
              WHERE orders.id IN ($/orderIds:list/)
            `,
            {
              orderIds,
            }
          );

          for (let index = 0; index < tokenIds.length; index++) {
            const orderId = orderIds[index];
            const tokenId = tokenIds[index];
            const orderInfo = dbOrders.find((c) => c.id === orderId);
            if (!orderInfo) {
              // Not found order info in database
              continue;
            }

            if (baseEventParams.timestamp * 1000 < new Date(orderInfo.updated_at).getTime()) {
              // Skip
              continue;
            }

            const currency = fromBuffer(orderInfo.currency);
            const currencyPrice = orderInfo.price;

            const priceData = await getUSDAndNativePrices(
              currency,
              currencyPrice,
              baseEventParams.timestamp
            );

            if (!priceData.nativePrice) {
              // We must always have the native price
              break;
            }

            onChainData.fillEventsOnChain.push({
              orderKind,
              orderSide: "sell",
              orderId,
              maker: baseEventParams.address,
              taker,
              price: orderInfo.price,
              currencyPrice,
              usdPrice: priceData.usdPrice,
              currency,
              contract: nftPool.nft,
              tokenId,
              amount: "1",
              orderSourceId: attributionData.orderSource?.id,
              aggregatorSourceId: attributionData.aggregatorSource?.id,
              fillSourceId: attributionData.fillSource?.id,
              baseEventParams: {
                ...baseEventParams,
                batchIndex: index + 1,
              },
            });

            onChainData.fillInfos.push({
              context: `nftx-${nftPool.nft}-${tokenIds[index]}-${baseEventParams.txHash}`,
              orderSide: "sell",
              contract: nftPool.nft,
              tokenId,
              amount: "1",
              price: priceData.nativePrice,
              timestamp: baseEventParams.timestamp,
              maker: baseEventParams.address,
              taker,
            });

            onChainData.orderInfos.push({
              context: `filled-${orderId}-${baseEventParams.txHash}`,
              id: orderId,
              trigger: {
                kind: "sale",
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
              },
            });
          }
        } else {
          const totalSwaps = [];

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
              if (currencyPrice && currency) {
                totalSwaps.push({
                  currency,
                  currencyPrice,
                });
              }
            }
          }

          if (!totalSwaps.length) {
            break;
          }

          const currency = totalSwaps[0].currency;
          const sameCurrency = totalSwaps.every((c) => c.currency === currency);
          const currencyPrice = totalSwaps
            .reduce((total, c) => total.add(bn(c.currencyPrice)), bn(0))
            .toString();

          if (currency && currencyPrice && sameCurrency) {
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

            for (let i = 0; i < tokenIds.length; i++) {
              const tokenId = tokenIds[i];
              const orderId = nftx.getOrderId(baseEventParams.address, "sell", tokenId);

              onChainData.fillEventsOnChain.push({
                orderKind,
                orderSide: "sell",
                orderId,
                maker: baseEventParams.address,
                taker,
                price: priceData.nativePrice,
                currencyPrice,
                usdPrice: priceData.usdPrice,
                currency,
                contract: nftPool.nft,
                tokenId,
                amount: "1",
                orderSourceId: attributionData.orderSource?.id,
                aggregatorSourceId: attributionData.aggregatorSource?.id,
                fillSourceId: attributionData.fillSource?.id,
                baseEventParams: {
                  ...baseEventParams,
                  batchIndex: i + 1,
                },
              });

              onChainData.fillInfos.push({
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

              onChainData.orderInfos.push({
                context: `filled-${orderId}-${baseEventParams.txHash}`,
                id: orderId,
                trigger: {
                  kind: "sale",
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                },
              });
            }
          }
        }

        break;
      }

      case "nftx-swapped":
      case "nftx-vault-init":
      case "nftx-vault-shutdown":
      case "nftx-eligibility-deployed":
      case "nftx-enable-mint-updated":
      case "nftx-enable-target-redeem-updated": {
        // Update pool
        onChainData.orders.push({
          kind: "nftx",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
            },
            metadata: {},
          },
        });

        break;
      }

      case "nftx-swap":
      case "nftx-mint":
      case "nftx-burn": {
        const ftPool = await nftxUtils.getFtPoolDetails(baseEventParams.address, true, "sushiswap");
        if (ftPool) {
          const token0NftPool = await nftxUtils.getNftPoolDetails(ftPool.token0, true);
          if (token0NftPool) {
            // Update pool
            onChainData.orders.push({
              kind: "nftx",
              info: {
                orderParams: {
                  pool: ftPool.token0,
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                  txBlock: baseEventParams.block,
                  logIndex: baseEventParams.logIndex,
                },
                metadata: {},
              },
            });
          }

          const token1NftPool = await nftxUtils.getNftPoolDetails(ftPool.token1, true);
          if (token1NftPool) {
            // Update pool
            onChainData.orders.push({
              kind: "nftx",
              info: {
                orderParams: {
                  pool: ftPool.token1,
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                  txBlock: baseEventParams.block,
                  logIndex: baseEventParams.logIndex,
                },
                metadata: {},
              },
            });
          }
        }

        break;
      }

      // The off-chain order pricing doesn't consider Uniswap V3 yet

      // case "nftx-swap-v3": {
      //   const skipCheck = false;
      //   const ftPool = await nftxUtils.getFtPoolDetails(
      //     baseEventParams.address,
      //     true,
      //     "uniswap-v3"
      //   );
      //   if (ftPool) {
      //     const token0NftPool = await nftxUtils.getNftPoolDetails(ftPool.token0, skipCheck);
      //     if (token0NftPool) {
      //       // Update pool
      //       onChainData.orders.push({
      //         kind: "nftx",
      //         info: {
      //           orderParams: {
      //             pool: ftPool.token0,
      //             txHash: baseEventParams.txHash,
      //             txTimestamp: baseEventParams.timestamp,
      //             txBlock: baseEventParams.block,
      //             logIndex: baseEventParams.logIndex,
      //           },
      //           metadata: {},
      //         },
      //       });
      //     }

      //     const token1NftPool = await nftxUtils.getNftPoolDetails(ftPool.token1, skipCheck);
      //     if (token1NftPool) {
      //       // Update pool
      //       onChainData.orders.push({
      //         kind: "nftx",
      //         info: {
      //           orderParams: {
      //             pool: ftPool.token1,
      //             txHash: baseEventParams.txHash,
      //             txTimestamp: baseEventParams.timestamp,
      //             txBlock: baseEventParams.block,
      //             logIndex: baseEventParams.logIndex,
      //           },
      //           metadata: {},
      //         },
      //       });
      //     }
      //   }

      //   break;
      // }
    }
  }
};
