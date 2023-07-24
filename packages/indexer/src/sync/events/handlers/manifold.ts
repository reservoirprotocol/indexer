import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { getStateChange } from "@georgeroman/evm-tx-simulator";
import * as Sdk from "@reservoir0x/sdk";

import { idb } from "@/common/db";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getOrderId } from "@/orderbook/orders/manifold";
import { manifold } from "@/orderbook/orders";
import { getUSDAndNativePrices } from "@/utils/prices";

import ExchangeAbi from "@reservoir0x/sdk/dist/manifold/abis/Exchange.json";
import { baseProvider } from "@/common/provider";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "manifold-cancel": {
        const { args } = eventData.abi.parseLog(log);
        const listingId = args["listingId"];
        const orderId = getOrderId(listingId);

        onChainData.cancelEventsOnChain.push({
          orderKind: "manifold",
          orderId,
          baseEventParams,
        });

        onChainData.orderInfos.push({
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
        const amount = parsedLog.args["count"].toString();
        let taker = parsedLog.args["buyer"].toLowerCase();

        const orderId = manifold.getOrderId(listingId);

        try {
          const marketplace = new Contract(
            Sdk.Manifold.Addresses.Exchange[config.chainId],
            ExchangeAbi,
            baseProvider
          );

          const listing = await marketplace.getListing(listingId);
          const contract = listing.token.address_.toLowerCase();
          const tokenId = listing.token.id.toString();
          const maker = listing.seller.toLowerCase();
          const currency = listing.details.erc20.toLowerCase();

          // Handle: attribution
          const orderKind = "manifold";
          const attributionData = await utils.extractAttributionData(
            baseEventParams.txHash,
            orderKind,
            { orderId }
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

          onChainData.fillEventsPartial.push({
            orderKind,
            orderId,
            orderSide: "sell",
            maker,
            taker,
            price: priceData.nativePrice,
            currency,
            currencyPrice,
            usdPrice: priceData.usdPrice,
            contract,
            tokenId,
            amount,
            orderSourceId: attributionData.orderSource?.id,
            aggregatorSourceId: attributionData.aggregatorSource?.id,
            fillSourceId: attributionData.fillSource?.id,
            baseEventParams,
          });

          const orderResult = await idb.oneOrNone(
            `
              SELECT
                raw_data,
                extract('epoch' from lower(orders.valid_between)) AS valid_from
              FROM orders
              WHERE orders.id = $/id/
            `,
            { id: orderId }
          );

          // Some manifold orders have an end time that is set after the first purchase
          if (orderResult && orderResult.valid_from === 0) {
            const endTime = baseEventParams.timestamp + orderResult.raw_data.details.endTime;
            onChainData.orders.push({
              kind: "manifold",
              info: {
                orderParams: {
                  id: listingId,
                  details: {
                    startTime: baseEventParams.timestamp,
                    endTime,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } as any,
                  txHash: baseEventParams.txHash,
                  txTimestamp: baseEventParams.timestamp,
                  txBlock: baseEventParams.block,
                  logIndex: baseEventParams.logIndex,
                  batchIndex: baseEventParams.batchIndex,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
                metadata: {},
              },
            });
          }

          onChainData.orderInfos.push({
            context: `filled-${orderId}-${baseEventParams.txHash}`,
            id: orderId,
            trigger: {
              kind: "sale",
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
            },
          });

          onChainData.fillInfos.push({
            context: `${orderId}-${baseEventParams.txHash}`,
            orderId: orderId,
            orderSide: "sell",
            contract,
            tokenId,
            amount,
            price: priceData.nativePrice,
            timestamp: baseEventParams.timestamp,
            maker,
            taker,
          });
        } catch {
          // Ignore errors
        }

        break;
      }

      case "manifold-modify": {
        const { args } = eventData.abi.parseLog(log);
        const listingId = args["listingId"];
        const initialAmount = args["initialAmount"].toString();
        const startTime = args["startTime"];
        const endTime = args["endTime"];

        // Manifold doesn't provide the full order info in the event. Using `any` helps us overcome
        // the type differences. If we don' want to use `any` we would have to specify some default
        // values for the whole struct.
        onChainData.orders.push({
          kind: "manifold",
          info: {
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
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              batchIndex: baseEventParams.batchIndex,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            metadata: {},
          },
        });

        break;
      }

      case "manifold-finalize": {
        const { args } = eventData.abi.parseLog(log);
        const listingId = args["listingId"];
        const orderId = getOrderId(listingId);

        const txTrace = await utils.fetchTransactionTrace(baseEventParams.txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        const state = getStateChange(txTrace.calls);

        let maker: string | undefined;
        let taker: string | undefined;
        let tokenContract: string | undefined;
        let tokenId: string | undefined;
        let currencyPrice: string | undefined;
        let currency = Sdk.Common.Addresses.Native[config.chainId];
        let purchasedAmount: string | undefined;
        let tokenKey: string | undefined;

        const contractTrace = state[baseEventParams.address];
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

        // We assume the maker is the address that got paid the largest amount of tokens.
        // In case of 50 / 50 splits, the maker will be the first address which got paid.
        let maxPayout: BigNumber | undefined;
        for (const payoutAddress of Object.keys(state).filter(
          (address) => address !== baseEventParams.address
        )) {
          const tokenPayouts = Object.keys(state[payoutAddress].tokenBalanceState).filter((token) =>
            token.includes(currency)
          );
          for (const token of tokenPayouts) {
            const tokensTransfered = bn(state[payoutAddress].tokenBalanceState[token]);
            if (tokensTransfered.gt(0) && (!maxPayout || tokensTransfered.gt(maxPayout))) {
              maxPayout = tokensTransfered;
              maker = payoutAddress;
            }
          }
        }

        if (!tokenKey) {
          break;
        }

        for (const address of Object.keys(state)) {
          if (tokenKey in state[address].tokenBalanceState) {
            // The taker should be the receiver of NFTs
            taker = address;
          }
        }

        if (
          !maker ||
          !currencyPrice ||
          currencyPrice === "0" ||
          !taker ||
          !tokenContract ||
          !tokenId ||
          !purchasedAmount
        ) {
          // Skip if the maker couldn't be retrieved
          break;
        }

        // Handle: attribution
        const orderKind = "manifold";
        const data = await utils.extractAttributionData(baseEventParams.txHash, orderKind, {
          orderId,
        });
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

        onChainData.fillEventsPartial.push({
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

        onChainData.fillInfos.push({
          context: `manifold-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide: "sell",
          contract: tokenContract,
          tokenId,
          amount: purchasedAmount,
          price: prices.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });
        break;
      }

      case "manifold-accept": {
        const parsedLog = eventData.abi.parseLog(log);
        const listingId = parsedLog.args["listingId"].toString();
        const currencyPrice = parsedLog.args["amount"].toString();
        const maker = parsedLog.args["oferrer"].toLowerCase();
        let currency = Sdk.Common.Addresses.Native[config.chainId];

        const orderId = manifold.getOrderId(listingId);

        const txTrace = await utils.fetchTransactionTrace(baseEventParams.txHash);
        if (!txTrace) {
          // Skip any failed attempts to get the trace
          break;
        }

        const state = getStateChange(txTrace.calls);

        let tokenContract: string | undefined;
        let tokenId: string | undefined;
        let amount: string | undefined;

        // This logic will only work when the transfer tokens are being minted
        // TODO Revisit this logic once manifold have began using the accept event without mints
        for (const transferEvent of onChainData.nftTransferEvents) {
          if (transferEvent.to === maker) {
            tokenId = transferEvent.tokenId;
            amount = transferEvent.amount;
          }
        }

        for (const mintEvent of onChainData.mintInfos) {
          if (mintEvent.tokenId === tokenId) {
            tokenContract = mintEvent.contract;
          }
        }

        for (const token of Object.keys(state[baseEventParams.address].tokenBalanceState)) {
          if (token.startsWith("erc20")) {
            currency = token.split(":")[1];
          }
        }

        // We assume the taker is the address that got paid the largest amount of tokens.
        // In case of 50 / 50 splits, the maker will be the first address which got paid.
        let maxPayout: BigNumber | undefined;
        const payoutAddresses = Object.keys(state).filter(
          (address) => address !== baseEventParams.address
        );

        let taker: string | undefined;
        for (const payoutAddress of payoutAddresses) {
          const tokenPayouts = Object.keys(state[payoutAddress].tokenBalanceState).filter((token) =>
            token.includes(currency)
          );
          for (const token of tokenPayouts) {
            const tokensTransfered = bn(state[payoutAddress].tokenBalanceState[token]);
            if (tokensTransfered.gt(0) && (!maxPayout || tokensTransfered.gt(maxPayout))) {
              maxPayout = tokensTransfered;
              taker = payoutAddress;
            }
          }
        }

        if (
          !taker ||
          !currencyPrice ||
          currencyPrice === "0" ||
          !maker ||
          !tokenContract ||
          !tokenId ||
          !amount
        ) {
          // Skip if we couldn't retrieve any of the params
          break;
        }

        // Handle: attribution
        const orderKind = "manifold";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
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

        onChainData.fillEventsPartial.push({
          orderKind,
          orderId,
          orderSide: "buy",
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
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
          context: `${orderId}-${baseEventParams.txHash}`,
          orderId: orderId,
          orderSide: "buy",
          contract: tokenContract,
          tokenId,
          amount,
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });

        break;
      }

      case "manifold-claim-initialized":
      case "manifold-claim-updated": {
        const parsedLog = eventData.abi.parseLog(log);
        const collection = parsedLog.args["creatorContract"].toLowerCase();
        const instanceId = parsedLog.args["claimIndex"].toString();

        onChainData.mints.push({
          by: "collection",
          data: {
            standard: "manifold",
            collection,
            additionalInfo: {
              extension: baseEventParams.address,
              instanceId,
            },
          },
        });
      }
    }
  }
};
