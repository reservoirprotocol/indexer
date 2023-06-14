import { Interface } from "@ethersproject/abi";
import { searchForCall } from "@georgeroman/evm-tx-simulator";

import { logger } from "@/common/logger";
import { bn } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import * as sudoswapV2 from "@/orderbook/orders/sudoswap-v2";
import { getUSDAndNativePrices } from "@/utils/prices";
import * as sudoswapUtils from "@/utils/sudoswap-v2";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // For keeping track of all individual trades per transaction
  const trades = {
    buy: new Map<string, number>(),
    sell: new Map<string, number>(),
  };

  logger.info("sudoswap-v2-debug", JSON.stringify(events));

  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      // Sudoswap is extremely poorly designed from the perspective of events
      // that get emitted on trades. As such, we use transaction tracing when
      // we detect sales in order to get more detailed information.

      case "sudoswap-v2-buy-erc721":
      case "sudoswap-v2-buy-erc1155": {
        const swapTokenForSpecificNFTs = "0x6d8b99f7";

        const txHash = baseEventParams.txHash;
        const address = baseEventParams.address;

        onChainData.orders.push({
          kind: "sudoswap-v2",
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

        const txTrace = await utils.fetchTransactionTrace(txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        // Search for the corresponding internal call to the Sudoswap pool
        const tradeRank = trades.buy.get(`${txHash}-${address}`) ?? 0;
        const poolCallTrace = searchForCall(
          txTrace.calls,
          {
            to: address,
            type: "CALL",
            sigHashes: [swapTokenForSpecificNFTs],
          },
          tradeRank
        );

        if (poolCallTrace?.output === "0x") {
          // Sometimes there can be upstream bugs and the call's output gets truncated
          logger.error(
            "sudoswap-v2-events-handler",
            `Trace missing output: ${baseEventParams.block} - ${baseEventParams.txHash}`
          );
        }

        if (poolCallTrace) {
          const sighash = poolCallTrace.input.slice(0, 10);
          const pool = await sudoswapUtils.getPoolDetails(baseEventParams.address);
          const isERC1155 = subKind.endsWith("erc1155");

          if (pool && sighash === swapTokenForSpecificNFTs) {
            const iface = new Interface([
              `
                function swapTokenForSpecificNFTs(
                  uint256[] calldata nftIds,
                  uint256 maxExpectedTokenInput,
                  address nftRecipient,
                  bool isRouter,
                  address routerCaller
                ) external returns (uint256 inputAmount)
              `,
            ]);
            const decodedInput = iface.decodeFunctionData(
              "swapTokenForSpecificNFTs",
              poolCallTrace.input
            );

            // Reference: https://github.com/ledgerwatch/erigon/issues/5308
            let estimatedInputAmount: string | undefined;
            if (poolCallTrace.output !== "0x") {
              // If the trace's output is available, decode the input amount from that
              estimatedInputAmount = iface
                .decodeFunctionResult("swapTokenForSpecificNFTs", poolCallTrace.output)
                .inputAmount.toString();
            } else {
              // Otherwise, estimate the input amount
              estimatedInputAmount = decodedInput.maxExpectedTokenInput.toString();
            }

            if (!estimatedInputAmount) {
              // Skip if we can't extract the input amount
              break;
            }

            let taker = decodedInput.nftRecipient.toLowerCase();
            const price = bn(estimatedInputAmount).div(decodedInput.nftIds.length).toString();

            // Handle: attribution

            const orderKind = "sudoswap-v2";
            const attributionData = await utils.extractAttributionData(
              baseEventParams.txHash,
              orderKind
            );
            if (attributionData.taker) {
              taker = attributionData.taker;
            }

            // Handle: prices

            const priceData = await getUSDAndNativePrices(
              pool.token,
              price,
              baseEventParams.timestamp
            );
            if (!priceData.nativePrice) {
              // We must always have the native price
              break;
            }

            for (let i = 0; i < decodedInput.nftIds.length; i++) {
              const tokenId = isERC1155 ? pool.tokenId! : decodedInput.nftIds[i].toString();
              const amount = isERC1155 ? decodedInput.nftIds[i].toString() : "1";
              const orderId = sudoswapV2.getOrderId(
                baseEventParams.address,
                isERC1155 ? "erc1155" : "erc721",
                "sell",
                tokenId
              );

              onChainData.fillEventsOnChain.push({
                orderKind,
                orderSide: "sell",
                orderId,
                maker: baseEventParams.address,
                taker,
                price: priceData.nativePrice,
                currencyPrice: price,
                usdPrice: priceData.usdPrice,
                currency: pool.token,
                contract: pool.nft,
                tokenId,
                amount,
                orderSourceId: attributionData.orderSource?.id,
                aggregatorSourceId: attributionData.aggregatorSource?.id,
                fillSourceId: attributionData.fillSource?.id,
                baseEventParams: {
                  ...baseEventParams,
                  batchIndex: i + 1,
                },
              });

              onChainData.fillInfos.push({
                context: `sudoswap-v2-${pool.nft}-${tokenId}-${baseEventParams.txHash}`,
                orderSide: "sell",
                contract: pool.nft,
                tokenId,
                amount,
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

        // Keep track of the "buy" trade
        trades.buy.set(`${txHash}-${address}`, tradeRank + 1);

        break;
      }

      case "sudoswap-v2-sell-erc1155":
      case "sudoswap-v2-sell-erc721": {
        const swapNFTsForToken = "0xb1d3f1c1";

        const txHash = baseEventParams.txHash;
        const address = baseEventParams.address;

        onChainData.orders.push({
          kind: "sudoswap-v2",
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

        const txTrace = await utils.fetchTransactionTrace(txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        // Search for the corresponding internal call to the Sudoswap pool
        const tradeRank = trades.sell.get(`${txHash}-${address}`) ?? 0;
        const poolCallTrace = searchForCall(
          txTrace.calls,
          { to: address, type: "CALL", sigHashes: [swapNFTsForToken] },
          tradeRank
        );

        if (poolCallTrace?.output === "0x") {
          // Sometimes there can be upstream bugs and the call's output gets truncated
          logger.error(
            "sudoswap-v2-events-handler",
            `Trace missing output: ${baseEventParams.block} - ${baseEventParams.txHash}`
          );
        }

        if (poolCallTrace) {
          const sighash = poolCallTrace.input.slice(0, 10);
          const pool = await sudoswapUtils.getPoolDetails(baseEventParams.address);
          const isERC1155 = subKind.endsWith("erc1155");

          if (pool && sighash === swapNFTsForToken) {
            const iface = new Interface([
              `
                function swapNFTsForToken(
                  uint256[] calldata nftIds,
                  uint256 minExpectedTokenOutput,
                  address payable tokenRecipient,
                  bool isRouter,
                  address routerCaller
                ) external returns (uint256 outputAmount)
              `,
            ]);
            const decodedInput = iface.decodeFunctionData("swapNFTsForToken", poolCallTrace.input);

            // Reference: https://github.com/ledgerwatch/erigon/issues/5308
            let estimatedOutputAmount: string | undefined;
            if (poolCallTrace.output !== "0x") {
              // If the trace's output is available, decode the output amount from that
              estimatedOutputAmount = iface
                .decodeFunctionResult("swapNFTsForToken", poolCallTrace.output)
                .outputAmount.toString();
            } else {
              // Otherwise, estimate the output amount
              estimatedOutputAmount = decodedInput.minExpectedTokenOutput;
              if (estimatedOutputAmount === "0") {
                estimatedOutputAmount = undefined;
              }
            }

            if (!estimatedOutputAmount) {
              // Skip if we can't extract the output amount
              break;
            }

            let taker = decodedInput.tokenRecipient.toLowerCase();

            const numItemsSold = isERC1155 ? decodedInput.nftIds[0] : decodedInput.nftIds.length;
            const price = bn(estimatedOutputAmount).div(numItemsSold).toString();

            // Handle: attribution

            const orderKind = "sudoswap-v2";
            const attributionData = await utils.extractAttributionData(
              baseEventParams.txHash,
              orderKind
            );
            if (attributionData.taker) {
              taker = attributionData.taker;
            }

            // Handle: prices

            const priceData = await getUSDAndNativePrices(
              pool.token,
              price,
              baseEventParams.timestamp
            );
            if (!priceData.nativePrice) {
              // We must always have the native price
              break;
            }

            for (let i = 0; i < decodedInput.nftIds.length; i++) {
              const tokenId = isERC1155 ? pool.tokenId! : decodedInput.nftIds[i].toString();
              const amount = isERC1155 ? decodedInput.nftIds[i].toString() : "1";
              const orderId = sudoswapV2.getOrderId(
                baseEventParams.address,
                isERC1155 ? "erc1155" : "erc721",
                "buy",
                pool.tokenId
              );

              onChainData.fillEventsPartial.push({
                orderKind,
                orderSide: "buy",
                orderId,
                maker: baseEventParams.address,
                taker,
                price: priceData.nativePrice,
                currencyPrice: price,
                usdPrice: priceData.usdPrice,
                currency: pool.token,
                contract: pool.nft,
                tokenId,
                amount,
                orderSourceId: attributionData.orderSource?.id,
                aggregatorSourceId: attributionData.aggregatorSource?.id,
                fillSourceId: attributionData.fillSource?.id,
                baseEventParams: {
                  ...baseEventParams,
                  batchIndex: i + 1,
                },
              });

              onChainData.fillInfos.push({
                context: `sudoswap-v2-${pool.nft}-${tokenId}-${baseEventParams.txHash}`,
                orderSide: "buy",
                contract: pool.nft,
                tokenId,
                amount,
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

        // Keep track of the "sell" trade
        trades.sell.set(`${txHash}-${address}`, tradeRank + 1);

        break;
      }

      case "sudoswap-v2-new-erc1155-pair":
      case "sudoswap-v2-new-erc721-pair":
      case "sudoswap-v2-erc20-deposit":
      case "sudoswap-v2-erc721-deposit":
      case "sudoswap-v2-erc1155-deposit": {
        const parsedLog = eventData.abi.parseLog(log);
        const pool = parsedLog.args["poolAddress"].toLowerCase();

        onChainData.orders.push({
          kind: "sudoswap-v2",
          info: {
            orderParams: {
              pool,
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

      case "sudoswap-v2-token-deposit":
      case "sudoswap-v2-token-withdrawal":
      case "sudoswap-v2-nft-withdrawal-erc721":
      case "sudoswap-v2-nft-withdrawal-erc1155":
      case "sudoswap-v2-spot-price-update":
      case "sudoswap-v2-delta-update": {
        onChainData.orders.push({
          kind: "sudoswap-v2",
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
    }

    logger.info("sudoswap-v2-debug", JSON.stringify(onChainData));
  }
};
