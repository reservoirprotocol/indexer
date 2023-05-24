import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { searchForCall } from "@georgeroman/evm-tx-simulator";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import { acceptsTokenIds } from "@/events-sync/data/collectionxyz";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getOrderId, getPoolDetails } from "@/orderbook/orders/collectionxyz";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // For keeping track of all individual trades per transaction
  const trades = {
    buy: new Map<string, number>(),
    sell: new Map<string, number>(),
  };

  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "collectionxyz-swap-nft-out-pool": {
        const swapTokenForAnyNFTs = "0x28b8aee1";
        const swapTokenForSpecificNFTs = "0x6d8b99f7";

        const txHash = baseEventParams.txHash;
        const address = baseEventParams.address;

        onChainData.orders.push({
          kind: "collectionxyz",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              isModifierEvent: true,
              feesModified: false,
              royaltyRecipientFallback: undefined,
              assetRecipient: undefined,
              externalFilter: undefined,
            },
            metadata: {},
          },
        });

        const parsedLog = eventData.abi.parseLog(log);
        const pool = await getPoolDetails(baseEventParams.address);

        const txTrace = await utils.fetchTransactionTrace(txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        // Search for the corresponding internal call to the collectionxyz pool
        const tradeRank = trades.buy.get(`${txHash}-${address}`) ?? 0;
        const poolCallTrace = searchForCall(
          txTrace.calls,
          {
            to: address,
            type: "CALL",
            sigHashes: [swapTokenForAnyNFTs, swapTokenForSpecificNFTs],
          },
          tradeRank
        );

        if (poolCallTrace?.output === "0x") {
          // Sometimes there can be upstream bugs and the call's output gets truncated
          logger.error(
            "collectionxyz-events-handler",
            `Trace missing output: ${baseEventParams.block} - ${baseEventParams.txHash}`
          );
        }

        const sighash = poolCallTrace?.input?.slice(0, 10);
        if (pool && (sighash === swapTokenForSpecificNFTs || sighash === swapTokenForAnyNFTs)) {
          const iface = new Interface([
            `
              function swapTokenForSpecificNFTs(
                uint256[] memory nftIds,
                uint256 maxExpectedTokenInput,
                address nftRecipient,
                bool isRouter,
                address routerCaller
              ) external returns (uint256 inputAmount)
            `,
            `
              function swapTokenForAnyNFTs(
                uint256 numNFTs,
                uint256 maxExpectedTokenInput,
                address nftRecipient,
                bool isRouter,
                address routerCaller
              ) external returns (uint256 inputAmount)
            `,
          ]);
          const decodedInput = iface.decodeFunctionData(
            sighash === swapTokenForSpecificNFTs
              ? "swapTokenForSpecificNFTs"
              : "swapTokenForAnyNFTs",
            poolCallTrace!.input // Trace definitely not undefined since sighash defined
          );
          let taker = decodedInput.nftRecipient.toLowerCase();
          const price = bn(parsedLog.args["inputAmount"])
            .div(parsedLog.args["nftIds"].length)
            .toString();

          // Handle: attribution
          const orderKind = "collectionxyz";
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

          let i = 0;
          for (const nftId of parsedLog.args["nftIds"]) {
            const tokenId = nftId.toString();
            const orderId = getOrderId(baseEventParams.address, "sell", tokenId);

            onChainData.fillEventsOnChain.push({
              orderKind,
              orderSide: "sell", // Pool is selling to taker
              orderId,
              maker: baseEventParams.address,
              taker,
              price: priceData.nativePrice,
              currencyPrice: price,
              usdPrice: priceData.usdPrice,
              currency: pool.token,
              contract: pool.nft,
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
              context: `collectionxyz-${pool.nft}-${tokenId}-${baseEventParams.txHash}`,
              orderSide: "sell", // Pool is selling to taker
              contract: pool.nft,
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

            // Make sure to increment the batch counter
            i++;
          }
        }

        // Keep track of the "buy" trade
        trades.buy.set(`${txHash}-${address}`, tradeRank + 1);

        break;
      }

      case "collectionxyz-swap-nft-in-pool": {
        const swapNFTsForToken = "0xa6ad64b2";

        const txHash = baseEventParams.txHash;
        const address = baseEventParams.address;

        onChainData.orders.push({
          kind: "collectionxyz",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              isModifierEvent: true,
              feesModified: false,
              royaltyRecipientFallback: undefined,
              assetRecipient: undefined,
              externalFilter: undefined,
            },
            metadata: {},
          },
        });

        const txTrace = await utils.fetchTransactionTrace(txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        // Search for the corresponding internal call to the collectionxyz pool
        const tradeRank = trades.sell.get(`${txHash}-${address}`) ?? 0;
        const poolCallTrace = searchForCall(
          txTrace.calls,
          { to: address, type: "CALL", sigHashes: [swapNFTsForToken] },
          tradeRank
        );

        if (poolCallTrace?.output === "0x") {
          // Sometimes there can be upstream bugs and the call's output gets truncated
          logger.error(
            "collectionxyz-events-handler",
            `Trace missing output: ${baseEventParams.block} - ${baseEventParams.txHash}`
          );
        }

        if (poolCallTrace) {
          const sighash = poolCallTrace.input.slice(0, 10);
          const parsedLog = eventData.abi.parseLog(log);
          const pool = await getPoolDetails(baseEventParams.address);

          if (pool && sighash === swapNFTsForToken) {
            const iface = new Interface([
              `
                function swapNFTsForToken(
                  (uint256[] ids,bytes32[] proof,bool[] proofFlags) nfts,
                  uint256 minExpectedTokenOutput,
                  address payable tokenRecipient,
                  bool isRouter,
                  address routerCaller,
                  bytes externalFilterContext
                ) external returns (uint256 outputAmount)
              `,
            ]);
            const decodedInput = iface.decodeFunctionData("swapNFTsForToken", poolCallTrace.input);

            let taker = decodedInput.tokenRecipient.toLowerCase();
            const price = bn(parsedLog.args["outputAmount"])
              .div(parsedLog.args["nftIds"].length)
              .toString();

            // Handle: attribution
            const orderKind = "collectionxyz";
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

            let i = 0;
            for (const nftId of parsedLog.args["nftIds"]) {
              const tokenId = nftId.toString();
              const orderId = getOrderId(baseEventParams.address, "buy");

              onChainData.fillEventsPartial.push({
                orderKind,
                orderSide: "buy", // Pool is buying from taker
                orderId,
                maker: baseEventParams.address,
                taker,
                price: priceData.nativePrice,
                currencyPrice: price,
                usdPrice: priceData.usdPrice,
                currency: pool.token,
                contract: pool.nft,
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
                context: `collectionxyz-${pool.nft}-${tokenId}-${baseEventParams.txHash}`,
                orderSide: "buy", // Pool is buying from taker
                contract: pool.nft,
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

              // Make sure to increment the batch counter
              i++;
            }
          }
        }

        // Keep track of the "sell" trade
        trades.sell.set(`${txHash}-${address}`, tradeRank + 1);

        break;
      }

      case "collectionxyz-new-pool": {
        const parsedLog = eventData.abi.parseLog(log);
        const pool = parsedLog.args["poolAddress"].toLowerCase();

        // New pools will need encoded tokenIds from the AcceptsTokenIDs event
        const receipt = await baseProvider.getTransactionReceipt(baseEventParams.txHash);
        const acceptsTokenIdsLog = receipt.logs
          .map((log) => {
            try {
              return acceptsTokenIds.abi.parseLog(log);
            } catch (err) {
              return undefined;
            }
          })
          .filter((log) => log !== undefined)[0];

        // encodedTokenIds is [] to represent unfiltered pool. undefined value
        // is reserved for events which don't modify encodedTokenIds
        const encodedTokenIds = acceptsTokenIdsLog?.args["_data"] ?? "0x";

        const poolIface = new Interface([
          "function royaltyRecipientFallback() public view returns (address)",
          "function assetRecipient() public view returns (address)",
          "function externalFilter() public view returns (address)",
          "function poolType() public view returns (uint8)",
        ]);
        const poolContract = new Contract(pool, poolIface, baseProvider);
        const poolType = await poolContract.poolType();
        const isTradePool = poolType === 2;

        onChainData.orders.push({
          kind: "collectionxyz",
          info: {
            orderParams: {
              pool,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              encodedTokenIds,
              isModifierEvent: false,
              // Need to make on chain call to get the fees because 1st time seeing
              feesModified: true,
              royaltyRecipientFallback: await poolContract.royaltyRecipientFallback(),
              assetRecipient: isTradePool ? pool : await poolContract.assetRecipient(),
              externalFilter: await poolContract.externalFilter(),
            },
            metadata: {},
          },
        });

        break;
      }

      case "collectionxyz-accepts-token-ids": {
        const parsedLog = eventData.abi.parseLog(log);
        const encodedTokenIds = parsedLog.args["_data"] ?? "0x";

        onChainData.orders.push({
          kind: "collectionxyz",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              encodedTokenIds,
              isModifierEvent: true,
              feesModified: false,
              royaltyRecipientFallback: undefined,
              assetRecipient: undefined,
              externalFilter: undefined,
            },
            metadata: {},
          },
        });

        break;
      }

      // Modification events which DO modify fees
      case "collectionxyz-royalty-numerator-update":
      case "collectionxyz-protocol-fee-multiplier-update":
      case "collectionxyz-carry-fee-multiplier-update":
      case "collectionxyz-fee-update": {
        onChainData.orders.push({
          kind: "collectionxyz",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              isModifierEvent: true,
              feesModified: true,
              royaltyRecipientFallback: undefined,
              assetRecipient: undefined,
              externalFilter: undefined,
            },
            metadata: {},
          },
        });

        break;
      }

      // Modification events which DO NOT modify fees
      case "collectionxyz-royalty-recipient-fallback-update": {
        const parsedLog = eventData.abi.parseLog(log);
        const newFallback = parsedLog.args["newFallback"].toLowerCase();
        onChainData.orders.push({
          kind: "collectionxyz",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              isModifierEvent: true,
              feesModified: false,
              royaltyRecipientFallback: newFallback,
              assetRecipient: undefined,
              externalFilter: undefined,
            },
            metadata: {},
          },
        });

        break;
      }

      case "collectionxyz-asset-recipient-change": {
        const parsedLog = eventData.abi.parseLog(log);
        const newAssetRecipient = parsedLog.args["a"].toLowerCase();
        onChainData.orders.push({
          kind: "collectionxyz",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              isModifierEvent: true,
              feesModified: false,
              royaltyRecipientFallback: undefined,
              assetRecipient: newAssetRecipient,
              externalFilter: undefined,
            },
            metadata: {},
          },
        });

        break;
      }

      case "collectionxyz-external-filter-set": {
        const parsedLog = eventData.abi.parseLog(log);
        const newAssetRecipient = parsedLog.args["filterAddress"].toLowerCase();
        onChainData.orders.push({
          kind: "collectionxyz",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              isModifierEvent: true,
              feesModified: false,
              royaltyRecipientFallback: undefined,
              assetRecipient: undefined,
              externalFilter: newAssetRecipient,
            },
            metadata: {},
          },
        });

        break;
      }

      case "collectionxyz-accrued-trade-fee-withdrawal":
      case "collectionxyz-spot-price-update":
      case "collectionxyz-delta-update":
      case "collectionxyz-props-update":
      case "collectionxyz-state-update":
      case "collectionxyz-token-deposit":
      case "collectionxyz-token-withdrawal":
      case "collectionxyz-nft-deposit":
      case "collectionxyz-nft-withdrawal": {
        onChainData.orders.push({
          kind: "collectionxyz",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              isModifierEvent: true,
              feesModified: false,
              royaltyRecipientFallback: undefined,
              assetRecipient: undefined,
              externalFilter: undefined,
            },
            metadata: {},
          },
        });

        break;
      }
    }
  }
};
