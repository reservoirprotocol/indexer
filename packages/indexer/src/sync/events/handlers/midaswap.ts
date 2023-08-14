import { BigNumber } from "@ethersproject/bignumber";
import * as Sdk from "@reservoir0x/sdk";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import * as midaswapUtils from "@/utils/midaswap";
import { getUSDAndNativePrices } from "@/utils/prices";
import { getOrderId } from "@/orderbook/orders/midaswap";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  logger.info("midaswap-debug", JSON.stringify(events));

  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];

    switch (subKind) {
      case "midaswap-new-erc721-pair": {
        await midaswapUtils.getPoolDetails(baseEventParams.address);
        break;
      }

      case "midaswap-erc721-deposit": {
        const parsedLog = eventData.abi.parseLog(log);
        const lpTokenId = parsedLog.args["lpTokenId"] as BigNumber;
        const nftIds = parsedLog.args["nftIds"] as BigNumber[];
        const binLower = parsedLog.args["binLower"] as number;
        const binStep = parsedLog.args["binStep"] as number;

        nftIds.forEach((nftId: BigNumber) => {
          onChainData.orders.push({
            kind: "midaswap",
            info: {
              orderParams: {
                pool: baseEventParams.address,
                lpTokenId: lpTokenId.toString(),
                nftId: nftId.toString(),
                binLower: binLower,
                binstep: binStep,
                binAmount: nftIds.length,
                txHash: baseEventParams.txHash,
                txTimestamp: baseEventParams.timestamp,
                txBlock: baseEventParams.block,
                logIndex: baseEventParams.logIndex,
              },
              metadata: {},
            },
          });
        });

        break;
      }

      case "midaswap-erc20-deposit": {
        const parsedLog = eventData.abi.parseLog(log);

        const lpTokenId = parsedLog.args["lpTokenId"] as BigNumber;
        const binLower = parsedLog.args["binLower"] as number;
        const binStep = parsedLog.args["binStep"] as number;
        const binAmount = parsedLog.args["binAmount"] as BigNumber;

        onChainData.orders.push({
          kind: "midaswap",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              lpTokenId: lpTokenId.toString(),
              binLower: binLower,
              binstep: binStep,
              binAmount: binAmount.toNumber(),
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

      case "midaswap-position-burned": {
        const parsedLog = eventData.abi.parseLog(log);
        const lpTokenId = parsedLog.args["lpTokenId"] as BigNumber;

        const orderId = getOrderId(baseEventParams.address, lpTokenId.toString());
        const ids = await redb.manyOrNone(
          `
            SELECT
              orders.id
            FROM orders
            WHERE orders.kind = 'midaswap'
              AND orders.side = 'sell'
              AND orders.fillability_status = 'fillable'
              AND orders.approval_status = 'approved'
              AND orders.contract IS NOT NULL
              AND orders.raw_data->>'lpTokenId' = $/lpTokenId/
          `,
          {
            lpTokenId: lpTokenId.toString(),
          }
        );

        [...ids.map((item) => item.id), orderId].forEach((id) => {
          onChainData.cancelEvents.push({
            orderKind: "midaswap",
            orderId: id,
            baseEventParams,
          });

          onChainData.orderInfos.push({
            context: `cancelled-${id}-${baseEventParams.txHash}`,
            id,
            trigger: {
              kind: "cancel",
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              logIndex: baseEventParams.logIndex,
              batchIndex: baseEventParams.batchIndex,
              blockHash: baseEventParams.blockHash,
            },
          });
        });

        break;
      }

      case "midaswap-buy-erc721": {
        const parsedLog = eventData.abi.parseLog(log);
        const tradeBin = parsedLog.args["tradeBin"] as number;
        const tokenId = parsedLog.args["nftTokenId"] as BigNumber;
        const lpTokenId = parsedLog.args["lpTokenId"] as BigNumber;

        const pool = await midaswapUtils.getPoolDetails(baseEventParams.address);
        if (!pool) {
          break;
        }

        const orderId = getOrderId(pool.address, lpTokenId.toString(), tokenId.toString());
        const orderKind = "midaswap";
        const taker = (await utils.fetchTransaction(baseEventParams.txHash)).from;

        const price = Sdk.Midaswap.Order.getSellPrice(tradeBin);
        const priceData = await getUSDAndNativePrices(pool.token, price, baseEventParams.timestamp);
        if (!priceData.nativePrice) {
          break;
        }

        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
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
          tokenId: tokenId.toString(),
          amount: "1",
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        onChainData.fillInfos.push({
          context: `midaswap-${pool.nft}-${tokenId}-${baseEventParams.txHash}`,
          orderId,
          orderSide: "sell",
          contract: pool.nft,
          tokenId: tokenId.toString(),
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

        onChainData.orders.push({
          kind: "midaswap",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              nftId: tokenId.toString(),
              tradeBin,
              lpTokenId: lpTokenId.toString(),
              orderId,
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

      case "midaswap-sell-erc721": {
        const parsedLog = eventData.abi.parseLog(log);
        const tradeBin = parsedLog.args["tradeBin"] as number;
        const tokenId = parsedLog.args["nftTokenId"] as BigNumber;
        const lpTokenId = parsedLog.args["lpTokenId"] as BigNumber;

        const pool = await midaswapUtils.getPoolDetails(baseEventParams.address);
        if (!pool) {
          break;
        }

        const orderId = getOrderId(pool.address, lpTokenId.toString());
        const orderKind = "midaswap";
        const taker = (await utils.fetchTransaction(baseEventParams.txHash)).from;

        const price = Sdk.Midaswap.Order.getBuyPrice(tradeBin);
        const priceData = await getUSDAndNativePrices(pool.token, price, baseEventParams.timestamp);
        if (!priceData.nativePrice) {
          break;
        }

        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
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
          tokenId: tokenId.toString(),
          amount: "1",
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        onChainData.fillInfos.push({
          context: `midaswap-${pool.nft}-${tokenId}-${baseEventParams.txHash}`,
          orderId,
          orderSide: "buy",
          contract: pool.nft,
          tokenId: tokenId.toString(),
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

        onChainData.orders.push({
          kind: "midaswap",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              nftId: tokenId.toString(),
              tradeBin,
              lpTokenId: lpTokenId.toString(),
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

    logger.info("midaswap-debug", JSON.stringify(onChainData));
  }
};
