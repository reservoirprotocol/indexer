import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { getUSDAndNativePrices } from "@/utils/prices";
import * as utils from "@/events-sync/utils";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { searchForCall } from "@georgeroman/evm-tx-simulator";
import * as commonHelpers from "@/orderbook/orders/common/helpers";

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // For keeping track of all individual trades per transaction
  const trades = {
    order: new Map<string, number>(),
  };

  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "blend-nonce-incremented": {
        const parsedLog = eventData.abi.parseLog(log);
        const maker = parsedLog.args["user"].toLowerCase();
        const newNonce = parsedLog.args["newNonce"].toString();
        onChainData.bulkCancelEvents.push({
          orderKind: "blend",
          maker,
          minNonce: newNonce,
          baseEventParams,
        });
        break;
      }

      case "blend-buy-locked": {
        const txHash = baseEventParams.txHash;
        const txTrace = await utils.fetchTransactionTrace(txHash);
        if (!txTrace) {
          break;
        }

        const exchange = new Sdk.Blend.Exchange(config.chainId);
        const exchangeAddress = exchange.contract.address;
        const methods = [
          {
            selector: "0xe7efc178",
            name: "buyLocked",
          },
          {
            selector: "0x8553b234",
            name: "buyLockedETH",
          },
          {
            selector: "0x2e2fb18b",
            name: "buyToBorrowLocked",
          },
          {
            selector: "0xb2a0bb86",
            name: "buyToBorrowLockedETH",
          },
        ];

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

        if (!executeCallTrace) {
          break;
        }

        const matchMethod = methods.find((c) => executeCallTrace.input.includes(c.selector));
        if (!matchMethod) {
          break;
        }

        const inputData = exchange.contract.interface.decodeFunctionData(
          matchMethod.name,
          executeCallTrace.input
        );

        // Handle: prices
        const currency = Sdk.Common.Addresses.Native[config.chainId];
        const isBuyToBorrow = matchMethod?.name.includes("buyToBorrowLocked");

        const offer = isBuyToBorrow ? inputData.sellInput.offer : inputData.offer;
        const lien = inputData.lien;
        const signature = isBuyToBorrow ? inputData.sellInput.signature : inputData.signature;

        const currencyPrice = offer.price.toString();

        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );

        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const minNonce = await commonHelpers.getMinNonce("blend", offer.borrower);
        const order = new Sdk.Blend.Order(config.chainId, {
          borrower: offer.borrower,
          lienId: offer.lienId.toString(),
          price: offer.price.toString(),
          expirationTime: offer.expirationTime,
          salt: offer.salt,
          oracle: offer.oracle,
          fees: offer.fees,
          nonce: minNonce.toString(),
          signature: signature,
        });

        let isValidated = false;
        const orderId = order.hash();
        for (let nonce = minNonce.toNumber(); nonce >= 0; nonce--) {
          order.params.nonce = nonce.toString();
          try {
            order.checkSignature();
            isValidated = true;
            break;
          } catch {
            // skip error
          }
        }

        if (!isValidated) {
          // not validated
          return;
        }

        // Handle: attribution
        const orderKind = "blend";

        let taker = executeCallTrace.from;
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind,
          { orderId }
        );

        if (attributionData.taker) {
          taker = attributionData.taker;
        }

        const maker = offer.borrower.toLowerCase();
        onChainData.fillEvents.push({
          orderKind: "blend",
          orderId,
          orderSide: "sell",
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: lien.collection.toLowerCase(),
          tokenId: lien.tokenId.toString(),
          amount: "1",
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });

        trades.order.set(`${txHash}-${exchangeAddress}`, tradeRank + 1);

        break;
      }
    }
  }
};
