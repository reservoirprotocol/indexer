import { Log } from "@ethersproject/abstract-provider";
import * as Sdk from "@reservoir0x/sdk";

import { idb } from "@/common/db";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getERC20Transfer } from "@/events-sync/handlers/utils/erc20";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (
  events: EnhancedEvent[],
  onChainData: OnChainData,
  backfill?: boolean
) => {
  // Keep track of all events within the currently processing transaction
  let currentTx: string | undefined;
  let currentTxLogs: Log[] = [];

  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    if (currentTx !== baseEventParams.txHash) {
      currentTx = baseEventParams.txHash;
      currentTxLogs = [];
    }
    currentTxLogs.push(log);

    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "zeroex-v4-erc721-order-cancelled":
      case "zeroex-v4-erc1155-order-cancelled": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["maker"].toLowerCase();
        const nonce = parsedLog.args["nonce"].toString();

        onChainData.nonceCancelEvents.push({
          orderKind:
            subKind === "zeroex-v4-erc721-order-cancelled"
              ? "zeroex-v4-erc721"
              : "zeroex-v4-erc1155",
          maker,
          nonce,
          baseEventParams,
        });

        break;
      }

      case "zeroex-v4-erc721-order-filled": {
        const parsedLog = eventData.abi.parseLog(log);
        const direction = parsedLog.args["direction"];
        const maker = parsedLog.args["maker"].toLowerCase();
        let taker = parsedLog.args["taker"].toLowerCase();
        const nonce = parsedLog.args["nonce"].toString();
        const erc20Token = parsedLog.args["erc20Token"].toLowerCase();
        const erc20TokenAmount = parsedLog.args["erc20TokenAmount"].toString();
        const erc721Token = parsedLog.args["erc721Token"].toLowerCase();
        const erc721TokenId = parsedLog.args["erc721TokenId"].toString();

        const orderKind = "zeroex-v4-erc721";

        // Handle: prices

        // By default, use the price without fees
        let currencyPrice = erc20TokenAmount;

        let orderId: string | undefined;
        if (!backfill) {
          // Since the event doesn't include the exact order which got matched
          // (it only includes the nonce, but we can potentially have multiple
          // different orders sharing the same nonce off-chain), we attempt to
          // detect the order id which got filled by checking the database for
          // orders which have the exact nonce/contract/price combination
          await idb
            .oneOrNone(
              `
                SELECT
                  orders.id,
                  orders.currency_price
                FROM orders
                WHERE orders.kind = '${orderKind}'
                  AND orders.maker = $/maker/
                  AND orders.nonce = $/nonce/
                  AND orders.contract = $/contract/
                  AND (orders.raw_data ->> 'erc20TokenAmount')::NUMERIC = $/price/
                LIMIT 1
              `,
              {
                maker: toBuffer(maker),
                nonce,
                contract: toBuffer(erc721Token),
                price: erc20TokenAmount,
              }
            )
            .then((result) => {
              if (result) {
                orderId = result.id;
                // Workaround the fact that 0xv4 fill events exclude the fee from the price
                // TODO: Use tracing to get the total price (including fees) for every fill
                currencyPrice = result.currency_price;
              }
            });
        }

        // Handle: attribution
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        let currency = erc20Token;
        if (currency === Sdk.ZeroExV4.Addresses.Native[config.chainId]) {
          // Map the weird ZeroEx ETH address to the default ETH address
          currency = Sdk.Common.Addresses.Native[config.chainId];
        }

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderSide = direction === 0 ? "sell" : "buy";
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
          contract: erc721Token,
          tokenId: erc721TokenId,
          amount: "1",
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        // Cancel all the other orders of the maker having the same nonce
        onChainData.nonceCancelEvents.push({
          orderKind,
          maker,
          nonce,
          baseEventParams,
        });

        if (orderId) {
          onChainData.orderInfos.push({
            context: `filled-${orderId}`,
            id: orderId,
            trigger: {
              kind: "sale",
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
            },
          });
        }

        onChainData.fillInfos.push({
          context: orderId || `${maker}-${nonce}`,
          orderId: orderId,
          orderSide,
          contract: erc721Token,
          tokenId: erc721TokenId,
          amount: "1",
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });

        // If an ERC20 transfer occured in the same transaction as a sale
        // then we need resync the maker's ERC20 approval to the exchange
        const erc20 = getERC20Transfer(currentTxLogs);
        if (erc20) {
          onChainData.makerInfos.push({
            context: `${baseEventParams.txHash}-buy-approval`,
            maker,
            trigger: {
              kind: "approval-change",
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
            },
            data: {
              kind: "buy-approval",
              contract: erc20,
              orderKind: orderKind,
            },
          });
        }

        break;
      }

      case "zeroex-v4-erc1155-order-filled": {
        const parsedLog = eventData.abi.parseLog(log);
        const direction = parsedLog.args["direction"];
        const maker = parsedLog.args["maker"].toLowerCase();
        let taker = parsedLog.args["taker"].toLowerCase();
        const nonce = parsedLog.args["nonce"].toString();
        const erc20Token = parsedLog.args["erc20Token"].toLowerCase();
        const erc20FillAmount = parsedLog.args["erc20FillAmount"].toString();
        const erc1155Token = parsedLog.args["erc1155Token"].toLowerCase();
        const erc1155TokenId = parsedLog.args["erc1155TokenId"].toString();
        const erc1155FillAmount = parsedLog.args["erc1155FillAmount"].toString();

        const orderKind = "zeroex-v4-erc1155";

        // Handle: prices

        // By default, use the price without fees
        let currencyPrice = bn(erc20FillAmount).div(erc1155FillAmount).toString();

        let orderId: string | undefined;
        if (!backfill) {
          // For ERC1155 orders we only allow unique nonce/contract/price. Since ERC1155
          // orders are partially fillable, we have to detect the price of an individual
          // item from the fill amount, which might result in imprecise results. However
          // at the moment, we can live with it
          await idb
            .oneOrNone(
              `
                SELECT
                  orders.id,
                  orders.currency_price
                FROM orders
                WHERE orders.kind = '${orderKind}'
                  AND orders.maker = $/maker/
                  AND orders.nonce = $/nonce/
                  AND orders.contract = $/contract/
                  AND (orders.raw_data ->> 'erc20TokenAmount')::NUMERIC / (orders.raw_data ->> 'nftAmount')::NUMERIC = $/price/
                LIMIT 1
              `,
              {
                maker: toBuffer(maker),
                nonce,
                contract: toBuffer(erc1155Token),
                price: bn(erc20FillAmount).div(erc1155FillAmount).toString(),
              }
            )
            .then((result) => {
              if (result) {
                orderId = result.id;
                // Workaround the fact that 0xv4 fill events exclude the fee from the price
                // TODO: Use tracing to get the total price (including fees) for every fill
                currencyPrice = bn(result.currency_price).mul(erc1155FillAmount).toString();
              }
            });
        }

        // Handle: attribution
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        let currency = erc20Token;
        if (currency === Sdk.ZeroExV4.Addresses.Native[config.chainId]) {
          // Map the weird ZeroEx ETH address to the default ETH address
          currency = Sdk.Common.Addresses.Native[config.chainId];
        }

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderSide = direction === 0 ? "sell" : "buy";
        onChainData.fillEventsPartial.push({
          orderKind,
          orderId,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: erc1155Token,
          tokenId: erc1155TokenId,
          amount: erc1155FillAmount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        if (orderId) {
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

        onChainData.fillInfos.push({
          context: orderId || `${maker}-${nonce}`,
          orderId: orderId,
          orderSide,
          contract: erc1155Token,
          tokenId: erc1155TokenId,
          amount: erc1155FillAmount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });

        // If an ERC20 transfer occured in the same transaction as a sale
        // then we need resync the maker's ERC20 approval to the exchange
        const erc20 = getERC20Transfer(currentTxLogs);
        if (erc20) {
          onChainData.makerInfos.push({
            context: `${baseEventParams.txHash}-buy-approval`,
            maker,
            trigger: {
              kind: "approval-change",
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
            },
            data: {
              kind: "buy-approval",
              contract: erc20,
              orderKind: orderKind,
            },
          });
        }

        break;
      }
    }
  }
};
