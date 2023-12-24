import { Result } from "@ethersproject/abi";

import { bn } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getOrderId } from "@/orderbook/orders/zora";
import { getUSDAndNativePrices } from "@/utils/prices";

const getOrderParams = (args: Result) => {
  const tokenId = args["tokenId"].toString();
  const tokenContract = args["tokenContract"].toLowerCase();
  const ask = args["ask"];
  const askPrice = ask["askPrice"].toString();
  const askCurrency = ask["askCurrency"].toLowerCase();
  const sellerFundsRecipient = ask["sellerFundsRecipient"].toLowerCase();
  const findersFeeBps = ask["findersFeeBps"];

  return {
    tokenContract,
    tokenId,
    askPrice,
    askCurrency,
    sellerFundsRecipient,
    findersFeeBps,
  };
};

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "zora-ask-filled": {
        const { args } = eventData.abi.parseLog(log);
        const tokenContract = args["tokenContract"].toLowerCase();
        const tokenId = args["tokenId"].toString();
        let taker = args["buyer"].toLowerCase();
        const ask = args["ask"];
        const seller = ask["seller"].toLowerCase();
        const askCurrency = ask["askCurrency"].toLowerCase();
        const askPrice = ask["askPrice"].toString();

        const orderParams = getOrderParams(args);
        const orderId = getOrderId(orderParams);

        // Handle: attribution

        const orderKind = "zora-v3";
        const data = await utils.extractAttributionData(baseEventParams.txHash, orderKind, {
          orderId,
        });
        if (data.taker) {
          taker = data.taker;
        }

        // Handle: prices

        const prices = await getUSDAndNativePrices(
          askCurrency,
          askPrice,
          baseEventParams.timestamp
        );
        if (!prices.nativePrice) {
          // We must always have the native price
          break;
        }

        onChainData.fillEventsOnChain.push({
          orderKind,
          orderId,
          currency: askCurrency,
          orderSide: "sell",
          maker: seller,
          taker,
          price: prices.nativePrice,
          currencyPrice: askPrice,
          usdPrice: prices.usdPrice,
          contract: tokenContract,
          tokenId,
          amount: "1",
          orderSourceId: data.orderSource?.id,
          aggregatorSourceId: data.aggregatorSource?.id,
          fillSourceId: data.fillSource?.id,
          baseEventParams,
        });

        onChainData.fillInfos.push({
          context: `zora-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide: "sell",
          contract: tokenContract,
          tokenId,
          amount: "1",
          price: prices.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker: seller,
          taker,
        });

        break;
      }

      case "zora-ask-created": {
        const { args } = eventData.abi.parseLog(log);
        const orderParams = getOrderParams(args);
        const maker = (await utils.fetchTransaction(baseEventParams.txHash)).from.toLowerCase();
        const seller = args["ask"]["seller"].toLowerCase();

        onChainData.orders.push({
          kind: "zora-v3",
          info: {
            orderParams: {
              seller,
              maker,
              side: "sell",
              ...orderParams,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              batchIndex: baseEventParams.batchIndex,
            },
            metadata: {},
          },
        });

        break;
      }

      case "zora-ask-cancelled": {
        const { args } = eventData.abi.parseLog(log);
        const orderParams = getOrderParams(args);
        const orderId = getOrderId(orderParams);

        onChainData.cancelEventsOnChain.push({
          orderKind: "zora-v3",
          orderId,
          baseEventParams,
        });

        onChainData.orderInfos.push({
          context: `cancelled-${orderId}-${baseEventParams.txHash}`,
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

      case "zora-ask-price-updated": {
        const { args } = eventData.abi.parseLog(log);
        const orderParams = getOrderParams(args);
        const seller = args["ask"]["seller"].toLowerCase();

        onChainData.orders.push({
          kind: "zora-v3",
          info: {
            orderParams: {
              seller,
              maker: seller,
              side: "sell",
              ...orderParams,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
              batchIndex: baseEventParams.batchIndex,
            },
            metadata: {},
          },
        });

        break;
      }

      case "zora-auction-ended": {
        const { args } = eventData.abi.parseLog(log);
        const tokenId = args["tokenId"].toString();
        const tokenContract = args["tokenContract"].toLowerCase();
        const tokenOwner = args["tokenOwner"].toLowerCase();
        let taker = args["winner"].toLowerCase();
        const amount = args["amount"].toString();
        const curatorFee = args["curatorFee"].toString();
        const auctionCurrency = args["auctionCurrency"].toLowerCase();

        const price = bn(amount).add(curatorFee).toString();

        // Handle: attribution

        const orderKind = "zora-v3";
        const data = await utils.extractAttributionData(baseEventParams.txHash, orderKind);
        if (data.taker) {
          taker = data.taker;
        }

        // Handle: prices

        const prices = await getUSDAndNativePrices(
          auctionCurrency,
          price,
          baseEventParams.timestamp
        );
        if (!prices.nativePrice) {
          // We must always have the native price
          break;
        }

        onChainData.fillEventsOnChain.push({
          orderKind,
          currency: auctionCurrency,
          orderSide: "sell",
          taker,
          maker: tokenOwner,
          price: prices.nativePrice,
          currencyPrice: price,
          usdPrice: prices.usdPrice,
          contract: tokenContract,
          tokenId,
          amount: "1",
          orderSourceId: data.orderSource?.id,
          aggregatorSourceId: data.aggregatorSource?.id,
          fillSourceId: data.fillSource?.id,
          baseEventParams,
        });

        onChainData.fillInfos.push({
          context: `zora-${tokenContract}-${tokenId}-${baseEventParams.txHash}`,
          orderSide: "sell",
          contract: tokenContract,
          tokenId,
          amount: "1",
          price: prices.nativePrice,
          timestamp: baseEventParams.timestamp,
          taker,
          maker: tokenOwner,
        });

        break;
      }

      case "zora-sales-config-changed": {
        onChainData.mints.push({
          by: "collection",
          data: {
            standard: "zora",
            collection: baseEventParams.address,
          },
        });

        break;
      }

      case "zora-updated-token": {
        const { args } = eventData.abi.parseLog(log);
        onChainData.mints.push({
          by: "collection",
          data: {
            standard: "zora",
            collection: baseEventParams.address,
            tokenId: args["tokenId"].toString(),
          },
        });

        break;
      }

      case "zora-custom-mint-comment":
      case "zora-mint-comment": {
        const { args } = eventData.abi.parseLog(log);
        const token = args["tokenContract"].toLowerCase();
        const comment = args["comment"];
        const quantity = args["quantity"].toString();

        if (subKind === "zora-custom-mint-comment") {
          for (let i = 0; i < quantity; i++) {
            onChainData.mintComments.push({
              token,
              quantity,
              comment,
              baseEventParams,
            });
          }
        } else {
          const firstMintedTokenId = args["tokenId"];
          for (let i = 0; i < Number(quantity); i++) {
            const tokenId = firstMintedTokenId.add(i + 1);
            onChainData.mintComments.push({
              token,
              tokenId: tokenId.toString(),
              quantity,
              comment,
              baseEventParams,
            });
          }
        }

        break;
      }
    }
  }
};
