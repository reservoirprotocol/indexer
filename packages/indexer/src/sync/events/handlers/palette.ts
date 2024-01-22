import { Result } from "@ethersproject/abi";

import * as Sdk from "@reservoir0x/sdk";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getOrderId } from "@/orderbook/orders/palette";
import { getUSDAndNativePrices } from "@/utils/prices";
import { config } from "@/config/index";
import { AddressZero } from "@ethersproject/constants";

const getOrderParams = (
  args: Result,
  orderbook: string,
  side: "buy" | "sell",
  kind: "single-token" | "contract-wide"
): Sdk.Palette.Types.OrderParams => {
  const tokenId = args["tokenId"] ? args["tokenId"].toString() : undefined;
  const collection = args["collection"].toLowerCase();
  const price = (
    args["listingPrice"] ||
    args["price"] ||
    args["bidAmt"] ||
    args["bidValue"]
  ).toString();
  const privateBuyer = (args["privateBuyer"] || AddressZero).toLowerCase();
  const referrer = args["referrer"] ? args["referrer"].toLowerCase() : AddressZero;
  const deadline = args["deadline"] ? args["deadline"].toString() : undefined;
  const feePercentage = args["feePercentage"] ? args["feePercentage"].toString() : undefined;
  const hook = (args["hook"] || AddressZero).toLowerCase();
  const sellerOrBuyer = (args["lister"] || args["bidder"] || AddressZero).toLowerCase();
  const amount = (args["tokenQuantity"] || args["bidQuantity"] || 1).toString();
  return {
    kind,
    side,
    orderbook,
    collection,
    sellerOrBuyer,
    tokenId,
    price,
    privateBuyer,
    deadline,
    referrer,
    feePercentage,
    hook,
    amount,
  };
};

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "palette-specific-bid-accepted-721":
      case "palette-specific-bid-accepted-1155":
      case "palette-collection-offer-accepted-721":
      case "palette-collection-offer-accepted-1155":
      case "palette-filled-order-721":
      case "palette-filled-order-1155": {
        const { args } = eventData.abi.parseLog(log);

        const collection = args["collection"].toLowerCase();
        const orderbook = baseEventParams.address.toLowerCase();

        const tokenId = args["tokenId"].toString();
        let taker = (args["purchaser"] || args["owner"]).toLowerCase();
        const price = (args["listingPrice"] || args["bidAmt"]).toString();

        const amount = (args["bidAmt"] || args["tokenQuantity"] || 1).toString();

        const orderSide = subKind.includes("filled-order") ? "sell" : "buy";
        const kind = !subKind.includes("collection-offer") ? "single-token" : "contract-wide";
        const orderParams = getOrderParams(args, orderbook, orderSide, kind);

        const isCollectionOffer = subKind.includes("collection-offer");
        const orderId = getOrderId(orderParams, isCollectionOffer);

        const maker = (args["bidder"] || orderbook).toLowerCase();

        const currency = Sdk.Common.Addresses.Native[config.chainId];

        // Handle: attribution
        const orderKind = "palette";
        const data = await utils.extractAttributionData(baseEventParams.txHash, orderKind, {
          orderId,
        });
        if (data.taker) {
          taker = data.taker;
        }

        // Handle: prices

        const prices = await getUSDAndNativePrices(currency, price, baseEventParams.timestamp);
        if (!prices.nativePrice) {
          // We must always have the native price
          break;
        }

        onChainData.fillEventsOnChain.push({
          orderKind,
          orderId,
          currency,
          orderSide,
          maker,
          taker,
          price: prices.nativePrice,
          currencyPrice: price,
          usdPrice: prices.usdPrice,
          contract: collection,
          tokenId,
          amount,
          orderSourceId: data.orderSource?.id,
          aggregatorSourceId: data.aggregatorSource?.id,
          fillSourceId: data.fillSource?.id,
          baseEventParams,
        });

        onChainData.fillInfos.push({
          context: `palette-${collection}-${tokenId}-${baseEventParams.txHash}`,
          orderSide,
          contract: collection,
          tokenId,
          amount: "1",
          price: prices.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker,
          taker,
        });

        break;
      }

      case "palette-collection-offer-created":
      case "palette-collection-offer-modified":
      case "palette-listing-created-721":
      case "palette-listing-modified-721":
      case "palette-listing-created-1155":
      case "palette-listing-modified-1155":
      case "palette-specific-bid-created-721":
      case "palette-specific-bid-modified-721":
      case "palette-specific-bid-created-1155":
      case "palette-specific-bid-modified-1155": {
        const { args } = eventData.abi.parseLog(log);
        const orderbook = baseEventParams.address.toLowerCase();
        const orderSide =
          subKind.includes("specific-bid") || subKind.includes("collection-offer") ? "buy" : "sell";

        const kind = !subKind.includes("collection-offer") ? "single-token" : "contract-wide";
        const orderParams = getOrderParams(args, orderbook, orderSide, kind);

        onChainData.orders.push({
          kind: "palette",
          info: {
            orderParams: {
              ...orderParams,
              side: orderSide,
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

      case "palette-specific-bid-removed-721":
      case "palette-specific-bid-removed-1155":
      case "palette-collection-offer-cancelled":
      case "palette-removed-listing-1155":
      case "palette-removed-listing-721": {
        const { args } = eventData.abi.parseLog(log);
        const orderbook = baseEventParams.address.toLowerCase();
        const maker = (args["bidder"] || args["lister"]).toLowerCase();
        const collection = args["collection"].toLowerCase();
        const tokenId = args["tokenId"] ? args["tokenId"].toString() : undefined;
        const isCollectionOffer = subKind.includes("collection-offer");

        const orderId = getOrderId(
          {
            orderbook,
            sellerOrBuyer: maker,
            collection,
            tokenId,
          },
          isCollectionOffer
        );

        onChainData.cancelEventsOnChain.push({
          orderKind: "palette",
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
    }
  }
};
