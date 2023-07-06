import { searchForCall } from "@georgeroman/evm-tx-simulator";
import * as Sdk from "@reservoir0x/sdk";

import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as paymentProcessor from "@/orderbook/orders/payment-processor";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // For keeping track of all individual trades per transaction
  const trades = {
    order: new Map<string, number>(),
  };

  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "payment-processor-nonce-invalidated": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["account"].toLowerCase();
        const nonce = parsedLog.args["nonce"].toString();
        const marketplace = parsedLog.args["marketplace"].toLowerCase();
        const orderNonce = paymentProcessor.getOrderNonce(marketplace, nonce);

        onChainData.nonceCancelEvents.push({
          orderKind: "payment-processor",
          maker,
          nonce: orderNonce,
          baseEventParams,
        });

        break;
      }

      case "payment-processor-master-nonce-invalidated": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["account"].toLowerCase();
        const newNonce = parsedLog.args["nonce"].toString();

        // Cancel all maker's orders
        onChainData.bulkCancelEvents.push({
          orderKind: "payment-processor",
          maker,
          minNonce: newNonce,
          acrossAll: true,
          baseEventParams,
        });

        break;
      }

      case "payment-processor-buy-single-listing": {
        // Again the events are extremely poorly designed (order hash is not emitted)
        // so we have to rely on complex tricks (using call tracing) to associate the
        // sales to order ids

        const txHash = baseEventParams.txHash;
        const tx = await utils.fetchTransaction(txHash);

        const exchange = new Sdk.PaymentProcessor.Exchange(config.chainId);
        const exchangeAddress = exchange.contract.address;

        let relevantCalldata: string | undefined;
        const methods = [
          {
            selector: "0x7d26279c",
            name: "buySingleListing",
          },
          {
            selector: "0x5ed1f9bb",
            name: "buyBatchOfListings",
          },
        ];

        const txTrace = await utils.fetchTransactionTrace(txHash);
        if (txTrace) {
          const tradeRank = trades.order.get(`${txHash}-${exchangeAddress}`) ?? 0;
          const executeCallTrace = searchForCall(
            txTrace.calls,
            {
              to: exchangeAddress,
              type: "CALL",
              sigHashes: methods.map((c) => c.selector),
            },
            tradeRank
          );

          if (executeCallTrace) {
            relevantCalldata = executeCallTrace.input;
            trades.order.set(`${txHash}-${exchangeAddress}`, tradeRank + 1);
          }
        } else {
          relevantCalldata = tx.data;
        }

        const matchedMethod = methods.find((c) => relevantCalldata!.includes(c.selector));
        if (!matchedMethod) {
          break;
        }

        const inputData = exchange.contract.interface.decodeFunctionData(
          matchedMethod.name,
          relevantCalldata!
        );

        const isBatch = matchedMethod.name === "buyBatchOfListings";
        const saleDetailsArray = isBatch ? inputData.saleDetailsArray : [inputData.saleDetails];
        const signedListings = isBatch ? inputData.signedListings : [inputData.signedListing];
        const signedOffers = isBatch ? inputData.signedOffers : [inputData.signedOffer];

        for (let i = 0; i < saleDetailsArray.length; i++) {
          const [saleDetail, signedListing, signedOffer] = [
            saleDetailsArray[i],
            signedListings[i],
            signedOffers[i],
          ];

          const tokenAddress = saleDetail["tokenAddress"].toLowerCase();
          const tokenId = saleDetail["tokenId"].toString();
          const amount = saleDetail["amount"].toString();
          const currency = saleDetail["paymentCoin"].toLowerCase();
          const currencyPrice = saleDetail["offerPrice"].div(saleDetail["amount"]).toString();
          const seller = saleDetail["seller"].toLowerCase();
          const buyer = saleDetail["buyer"].toLowerCase();

          const caller = tx.from.toLowerCase();
          const orderSide = caller != seller ? "sell" : "buy";

          const isBuyOrder = orderSide === "buy";
          let taker = isBuyOrder ? seller : buyer;
          const maker = isBuyOrder ? buyer : seller;

          const sellerMinNonce = await commonHelpers.getMinNonce(
            "payment-processor",
            saleDetail["seller"].toLowerCase()
          );
          const buyerMinNonce = await commonHelpers.getMinNonce(
            "payment-processor",
            saleDetail["buyer"].toLowerCase()
          );

          const isCollectionLevel = saleDetail["collectionLevelOffer"];

          const singleBuilder = new Sdk.PaymentProcessor.Builders.SingleToken(config.chainId);
          const contractBuilder = new Sdk.PaymentProcessor.Builders.ContractWide(config.chainId);

          const orderSignature = isBuyOrder ? signedOffer : signedListing;
          const signature = {
            r: orderSignature.r,
            s: orderSignature.s,
            v: orderSignature.v,
          };

          const order = isCollectionLevel
            ? contractBuilder.build({
                protocol: saleDetail["protocol"],
                collectionLevelOffer: true,
                marketplace: saleDetail["marketplace"],
                marketplaceFeeNumerator: saleDetail["marketplaceFeeNumerator"],
                maxRoyaltyFeeNumerator: saleDetail["maxRoyaltyFeeNumerator"],
                trader: saleDetail["buyer"],
                tokenAddress: saleDetail["tokenAddress"],
                amount: saleDetail["amount"],
                price: saleDetail["offerPrice"],
                expiration: saleDetail["expiration"],
                nonce: saleDetail["offerNonce"],
                coin: saleDetail["paymentCoin"],
                masterNonce: buyerMinNonce,
                ...signature,
              })
            : singleBuilder.build(
                isBuyOrder
                  ? {
                      protocol: saleDetail["protocol"],
                      marketplace: saleDetail["marketplace"],
                      marketplaceFeeNumerator: saleDetail["marketplaceFeeNumerator"],
                      maxRoyaltyFeeNumerator: saleDetail["maxRoyaltyFeeNumerator"],
                      trader: saleDetail["buyer"],
                      tokenAddress: saleDetail["tokenAddress"],
                      amount: saleDetail["amount"],
                      tokenId: saleDetail["tokenId"],
                      expiration: saleDetail["offerExpiration"],
                      price: saleDetail["offerPrice"],
                      nonce: saleDetail["offerNonce"],
                      coin: saleDetail["paymentCoin"],
                      masterNonce: buyerMinNonce,
                      ...signature,
                    }
                  : {
                      protocol: saleDetail["protocol"],
                      sellerAcceptedOffer: false,
                      marketplace: saleDetail["marketplace"],
                      marketplaceFeeNumerator: saleDetail["marketplaceFeeNumerator"],
                      maxRoyaltyFeeNumerator: saleDetail["maxRoyaltyFeeNumerator"],
                      trader: saleDetail["seller"],
                      tokenAddress: saleDetail["tokenAddress"],
                      amount: saleDetail["amount"],
                      tokenId: saleDetail["tokenId"],
                      price: saleDetail["listingMinPrice"],
                      expiration: saleDetail["listingExpiration"],
                      nonce: saleDetail["listingNonce"],
                      coin: saleDetail["paymentCoin"],
                      masterNonce: sellerMinNonce,
                      ...signature,
                    }
              );

          let isValidated = false;
          for (let nonce = Number(order.params.masterNonce); nonce >= 0; nonce--) {
            order.params.masterNonce = nonce.toString();
            try {
              order.checkSignature();
              isValidated = true;
              break;
            } catch {
              // Skip errors
            }
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

          const orderId = isValidated ? order.hash() : undefined;

          // Handle: attribution
          const orderKind = "payment-processor";
          const attributionData = await utils.extractAttributionData(
            baseEventParams.txHash,
            orderKind,
            { orderId }
          );
          if (attributionData.taker) {
            taker = attributionData.taker;
          }

          onChainData.fillEvents.push({
            orderId,
            orderKind: "payment-processor",
            orderSide,
            maker,
            taker,
            price: priceData.nativePrice,
            currency,
            currencyPrice,
            usdPrice: priceData.usdPrice,
            contract: tokenAddress,
            tokenId: tokenId,
            amount: amount,
            orderSourceId: attributionData.orderSource?.id,
            aggregatorSourceId: attributionData.aggregatorSource?.id,
            fillSourceId: attributionData.fillSource?.id,
            baseEventParams,
          });
        }

        break;
      }

      // TODO: Add support for detecting the filled order ids
      // (or else the filled listings will be stale)
      case "payment-processor-sweep-collection-erc721":
      case "payment-processor-sweep-collection-erc1155": {
        const parsedLog = eventData.abi.parseLog(log);
        const tokenAddress = parsedLog.args["tokenAddress"].toLowerCase();
        const tokenIds = parsedLog.args["tokenIds"].map(String);
        const currency = parsedLog.args["paymentCoin"].toLowerCase();
        const buyer = parsedLog.args["buyer"].toLowerCase();
        const unsuccessfulFills = parsedLog.args["unsuccessfulFills"];

        for (let i = 0; i < tokenIds.length; i++) {
          if (!unsuccessfulFills[i]) {
            const tokenId = tokenIds[i];
            const currencyPrice = parsedLog.args["salePrices"][i]
              .div(parsedLog.args["amounts"][i])
              .toString();
            const seller = parsedLog.args["sellers"][i].toLowerCase();

            const priceData = await getUSDAndNativePrices(
              currency,
              currencyPrice,
              baseEventParams.timestamp
            );
            if (!priceData.nativePrice) {
              // We must always have the native price
              break;
            }

            // Handle: attribution
            const orderKind = "payment-processor";
            const attributionData = await utils.extractAttributionData(
              baseEventParams.txHash,
              orderKind
            );

            const amount = parsedLog.args["amounts"][i].toString();
            onChainData.fillEvents.push({
              orderKind: "payment-processor",
              orderSide: "sell",
              maker: seller,
              taker: buyer,
              price: priceData.nativePrice,
              currency,
              currencyPrice,
              usdPrice: priceData.usdPrice,
              contract: tokenAddress,
              tokenId: tokenId,
              amount: amount,
              orderSourceId: attributionData.orderSource?.id,
              aggregatorSourceId: attributionData.aggregatorSource?.id,
              fillSourceId: attributionData.fillSource?.id,
              baseEventParams,
            });
          }
        }

        break;
      }
    }
  }
};
