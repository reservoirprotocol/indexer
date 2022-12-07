import { Log } from "@ethersproject/abstract-provider";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

import { getEventData } from "@/events-sync/data";
import { bn } from "@/common/utils";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";

import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import { getOrderId, OrderInfo } from "@/orderbook/orders/manifold";
import { manifold } from "@/orderbook/orders";
import { getUSDAndNativePrices } from "@/utils/prices";
import { redb } from "@/common/db";
import { parseCallTrace } from "@georgeroman/evm-tx-simulator";

export const handleEvents = async (events: EnhancedEvent[]): Promise<OnChainData> => {
  const cancelEventsOnChain: es.cancels.Event[] = [];
  const fillEventsPartial: es.fills.Event[] = [];

  const fillInfos: fillUpdates.FillInfo[] = [];
  const orderInfos: orderUpdatesById.OrderInfo[] = [];
  const makerInfos: orderUpdatesByMaker.MakerInfo[] = [];

  // Keep track of any on-chain orders
  const orders: OrderInfo[] = [];

  // Keep track of all events within the currently processing transaction
  let currentTx: string | undefined;
  let currentTxLogs: Log[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    if (currentTx !== baseEventParams.txHash) {
      currentTx = baseEventParams.txHash;
      currentTxLogs = [];
    }
    currentTxLogs.push(log);

    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "manifold-cancel": {
        const { args } = eventData.abi.parseLog(log);
        const listingId = args["listingId"];
        const orderId = getOrderId(listingId);

        cancelEventsOnChain.push({
          orderKind: "manifold",
          orderId,
          baseEventParams,
        });

        orderInfos.push({
          context: `cancelled-${orderId}-${baseEventParams.txHash}-${Math.random()}`,
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

      case "manifold-purchase": {
        const parsedLog = eventData.abi.parseLog(log);
        const listingId = parsedLog.args["listingId"].toString();
        const currencyPrice = parsedLog.args["amount"].toString();
        let taker = parsedLog.args["buyer"].toLowerCase();
        let currency = Sdk.Common.Addresses.Eth[config.chainId];
        let maker = "";

        const orderId = manifold.getOrderId(listingId);

        const txTrace = await utils.fetchTransactionTrace(baseEventParams.txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        const parsedTrace = parseCallTrace(txTrace.calls);

        const tokenKey = Object.keys(parsedTrace[baseEventParams.address].tokenBalanceState)[0];
        const [, tokenContract, tokenId] = tokenKey.split(":");

        const purchasedAmount = bn(parsedTrace[baseEventParams.address].tokenBalanceState[tokenKey])
          .abs()
          .toString();

        for (const token of Object.keys(parsedTrace[taker].tokenBalanceState)) {
          if (token.startsWith("erc20")) {
            currency = token.split(":")[1];
          }
        }

        // We assume the seller is the address that got paid the largest amount of tokens
        // In case of 50/50 split, maker will be the first address paid
        let maxPayout = null;
        const payoutAddresses = Object.keys(parsedTrace).filter(
          (address) => address !== baseEventParams.address
        );

        for (const payoutAddress of payoutAddresses) {
          const tokenPayouts = Object.keys(parsedTrace[payoutAddress].tokenBalanceState).filter(
            (token) => token.includes(currency)
          );
          for (const token of tokenPayouts) {
            const tokensTransfered = bn(parsedTrace[payoutAddress].tokenBalanceState[token]);
            if (tokensTransfered.gt(0) && (!maxPayout || tokensTransfered.gt(maxPayout))) {
              maxPayout = tokensTransfered;
              maker = payoutAddress;
            }
          }
        }

        if (!maker) {
          // Skip if maker couldn't be retrieved
          break;
        }

        // Handle: attribution
        const orderKind = "manifold";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );

        if (attributionData.taker) {
          taker = attributionData.taker;
        }

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

        fillEventsPartial.push({
          orderKind,
          orderId,
          orderSide: "sell",
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: tokenContract,
          tokenId,
          amount: purchasedAmount,
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        const orderResult = await redb.oneOrNone(
          ` 
            SELECT 
              raw_data,
              extract('epoch' from lower(orders.valid_between)) AS valid_from
            FROM orders 
            WHERE orders.id = $/id/ 
          `,
          { id: orderId }
        );

        // Some manifold order have end time that is set after the first purchase
        if (orderResult && orderResult.valid_from === 0) {
          const endTime = baseEventParams.timestamp + orderResult.raw_data.details.endTime;
          orders.push({
            orderParams: {
              id: listingId,
              details: {
                startTime: baseEventParams.timestamp,
                endTime,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            metadata: {},
          });
        }

        orderInfos.push({
          context: `filled-${orderId}-${baseEventParams.txHash}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        fillInfos.push({
          context: `${orderId}-${baseEventParams.txHash}`,
          orderId: orderId,
          orderSide: "sell",
          contract: tokenContract,
          tokenId,
          amount: purchasedAmount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }

      case "manifold-modify": {
        const { args } = eventData.abi.parseLog(log);
        const listingId = args["listingId"];
        const initialAmount = args["initialAmount"].toString();
        const startTime = args["startTime"];
        const endTime = args["endTime"];

        // Manifold doesn't provide full order info. `any` helps us overcome the type differences.
        // If we don' want to use `any` we'd have to specify some default values for the whole struct
        orders.push({
          orderParams: {
            id: listingId,
            details: {
              startTime,
              endTime,
              initialAmount,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          metadata: {},
        });

        break;
      }

      case "manifold-finalize": {
        const { args } = eventData.abi.parseLog(log);
        const listingId = args["listingId"];
        const orderId = getOrderId(listingId);

        let maker = "";
        let tokenContract = "";
        let tokenId = "";
        let taker = "";
        let currencyPrice = "0";
        let currency = Sdk.Common.Addresses.Eth[config.chainId];

        const txTrace = await utils.fetchTransactionTrace(baseEventParams.txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        const parsedTrace = parseCallTrace(txTrace.calls);

        let purchasedAmount = "0";
        let tokenKey = "";
        const contractTrace = parsedTrace[baseEventParams.address];
        for (const token of Object.keys(contractTrace.tokenBalanceState)) {
          if (token.startsWith("erc721") || token.startsWith("erc1155")) {
            tokenKey = token;
            [, tokenContract, tokenId] = tokenKey.split(":");
            purchasedAmount = bn(contractTrace.tokenBalanceState[tokenKey]).abs().toString();
          } else if (token.startsWith("erc20") || token.startsWith("native")) {
            currency = token.split(":")[1];
            currencyPrice = bn(contractTrace.tokenBalanceState[token]).abs().toString();
          }
        }

        // We assume the seller is the address that got paid the largest amount of tokens
        // In case of 50/50 split, maker will be the first address paid
        let maxPayout = null;
        for (const payoutAddress of Object.keys(parsedTrace).filter(
          (address) => address !== baseEventParams.address
        )) {
          const tokenPayouts = Object.keys(parsedTrace[payoutAddress].tokenBalanceState).filter(
            (token) => token.includes(currency)
          );
          for (const token of tokenPayouts) {
            const tokensTransfered = bn(parsedTrace[payoutAddress].tokenBalanceState[token]);
            if (tokensTransfered.gt(0) && (!maxPayout || tokensTransfered.gt(maxPayout))) {
              maxPayout = tokensTransfered;
              maker = payoutAddress;
            }
          }
        }

        if (!maker) {
          // Skip if maker couldn't be retrieved
          break;
        }

        // not a sale event
        if (bn(currencyPrice).eq("0")) {
          break;
        }

        for (const address of Object.keys(parsedTrace)) {
          if (tokenKey in parsedTrace[address].tokenBalanceState) {
            // Taker should be receiver of NFT tokens
            taker = address;
          }
        }

        // Handle: attribution
        const orderKind = "manifold";
        const data = await utils.extractAttributionData(baseEventParams.txHash, orderKind);
        if (data.taker) {
          taker = data.taker;
        }

        // Handle: prices

        const prices = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!prices.nativePrice) {
          // We must always have the native price
          break;
        }

        fillEventsPartial.push({
          orderKind,
          orderId,
          currency,
          orderSide: "buy",
          maker,
          taker,
          price: prices.nativePrice,
          currencyPrice,
          usdPrice: prices.usdPrice,
          contract: tokenContract,
          tokenId,
          amount: purchasedAmount,
          orderSourceId: data.orderSource?.id,
          aggregatorSourceId: data.aggregatorSource?.id,
          fillSourceId: data.fillSource?.id,
          baseEventParams,
        });

        fillInfos.push({
          context: `manifold-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide: "sell",
          contract: tokenContract,
          tokenId,
          amount: purchasedAmount,
          price: prices.nativePrice,
          timestamp: baseEventParams.timestamp,
        });
        break;
      }
    }
  }

  return {
    cancelEventsOnChain,
    fillEventsPartial,

    fillInfos,
    orderInfos,
    makerInfos,
    orders: orders.map((info) => ({
      kind: "manifold",
      info,
    })),
  };
};
