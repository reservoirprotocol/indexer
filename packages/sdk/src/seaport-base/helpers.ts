import { BigNumber } from "@ethersproject/bignumber";

import * as Types from "../seaport-base/types";
import { bn, getCurrentTimestamp, generateRandomSalt, lc } from "../utils";

export const isCurrencyItem = ({ itemType }: { itemType: Types.ItemType }) =>
  [Types.ItemType.NATIVE, Types.ItemType.ERC20].includes(itemType);

export function getPrivateListingFulfillments(
  privateListingOrder: Types.OrderComponents
): Types.MatchOrdersFulfillment[] {
  const nftRelatedFulfillments: Types.MatchOrdersFulfillment[] = [];

  // For the original order, we need to match everything offered with every consideration item
  // on the original order that's set to go to the private listing recipient
  privateListingOrder.offer.forEach((offerItem, offerIndex) => {
    const considerationIndex = privateListingOrder.consideration.findIndex(
      (considerationItem) =>
        considerationItem.itemType === offerItem.itemType &&
        considerationItem.token === offerItem.token &&
        considerationItem.identifierOrCriteria === offerItem.identifierOrCriteria
    );
    if (considerationIndex === -1) {
      throw new Error(
        "Could not find matching offer item in the consideration for private listing"
      );
    }
    nftRelatedFulfillments.push({
      offerComponents: [
        {
          orderIndex: 0,
          itemIndex: offerIndex,
        },
      ],
      considerationComponents: [
        {
          orderIndex: 0,
          itemIndex: considerationIndex,
        },
      ],
    });
  });

  const currencyRelatedFulfillments: Types.MatchOrdersFulfillment[] = [];

  // For the original order, we need to match everything offered with every consideration item
  // on the original order that's set to go to the private listing recipient
  privateListingOrder.consideration.forEach((considerationItem, considerationIndex) => {
    if (!isCurrencyItem(considerationItem)) {
      return;
    }
    // We always match the offer item (index 0) of the counter order (index 1)
    // with all of the payment items on the private listing
    currencyRelatedFulfillments.push({
      offerComponents: [
        {
          orderIndex: 1,
          itemIndex: 0,
        },
      ],
      considerationComponents: [
        {
          orderIndex: 0,
          itemIndex: considerationIndex,
        },
      ],
    });
  });

  return [...nftRelatedFulfillments, ...currencyRelatedFulfillments];
}

export function isPrivateOrder(params: Types.OrderComponents) {
  let isPrivate = false;
  const { offerer, offer, consideration } = params;
  const nftListings = offer.filter((_) => !isCurrencyItem(_));

  const isListing = nftListings.length >= 1;
  if (isListing) {
    const hasPrivateConsideration = nftListings.every((item) => {
      const matchConsideration = consideration.find(
        (c) =>
          c.token == item.token &&
          c.identifierOrCriteria == item.identifierOrCriteria &&
          lc(c.recipient) != lc(offerer)
      );
      return matchConsideration;
    });
    if (hasPrivateConsideration) {
      isPrivate = true;
    }
  } else {
    // Private Bid?
  }
  return isPrivate;
}

export function constructPrivateListingCounterOrder(
  privateSaleRecipient: string,
  params: Types.OrderComponents
): Types.OrderWithCounter {
  // Counter order offers up all the items in the private listing consideration
  // besides the items that are going to the private listing recipient
  const paymentItems = params.consideration.filter(
    (item) => item.recipient.toLowerCase() !== privateSaleRecipient.toLowerCase()
  );

  if (!paymentItems.every((item) => isCurrencyItem(item))) {
    throw new Error(
      "The consideration for the private listing did not contain only currency items"
    );
  }
  if (!paymentItems.every((item) => item.itemType === paymentItems[0].itemType)) {
    throw new Error("Not all currency items were the same for private order");
  }

  const { aggregatedStartAmount, aggregatedEndAmount } = paymentItems.reduce(
    ({ aggregatedStartAmount, aggregatedEndAmount }, item) => ({
      aggregatedStartAmount: aggregatedStartAmount.add(item.startAmount),
      aggregatedEndAmount: aggregatedEndAmount.add(item.endAmount),
    }),
    {
      aggregatedStartAmount: BigNumber.from(0),
      aggregatedEndAmount: BigNumber.from(0),
    }
  );

  const counterOrder: Types.OrderWithCounter = {
    parameters: {
      ...params,
      offerer: privateSaleRecipient,
      offer: [
        {
          itemType: paymentItems[0].itemType,
          token: paymentItems[0].token,
          identifierOrCriteria: paymentItems[0].identifierOrCriteria,
          startAmount: aggregatedStartAmount.toString(),
          endAmount: aggregatedEndAmount.toString(),
        },
      ],
      // The consideration here is empty as the original private listing order supplies
      // the taker address to receive the desired items.
      consideration: [],
      salt: generateRandomSalt(),
      totalOriginalConsiderationItems: 0,
    },
    signature: "0x",
  };
  return counterOrder;
}

export function computeDynamicPrice(
  isBuy: boolean,
  params: Types.OrderComponents,
  timestampOverride?: number
) {
  let price = bn(0);

  const items = isBuy ? params.offer : params.consideration;
  for (const c of items) {
    const decreasing = bn(c.startAmount).gt(c.endAmount);

    // startAmount + (currentTime - startTime) / (endTime - startTime) * (endAmount - startAmount)
    const priceChange = bn(timestampOverride ?? getCurrentTimestamp(-60))
      .sub(params.startTime)
      .mul(bn(c.endAmount).sub(c.startAmount))
      .div(bn(params.endTime).sub(params.startTime));
    price = price.add(bn(c.startAmount).add(priceChange));

    // Ensure we don't return any negative prices
    const limitAmount = decreasing ? c.endAmount : c.startAmount;
    if (price.lt(limitAmount)) {
      price = bn(limitAmount);
    }
  }

  return price;
}
