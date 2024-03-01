import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import * as BaseAddresses from "../seaport-base/addresses";
import * as Types from "../seaport-base/types";
import { bn, getCurrentTimestamp, generateRandomSalt, lc } from "../utils";

// Export utility methods that handle cosigning
export { cosignOrder, computeReceivedItems } from "./cosign";

export const isCurrencyItem = ({ itemType }: { itemType: Types.ItemType }) =>
  [Types.ItemType.NATIVE, Types.ItemType.ERC20].includes(itemType);

export const getPrivateListingFulfillments = (
  privateListingOrder: Types.OrderComponents,
  startOrderIndex = 0
): Types.MatchOrdersFulfillment[] => {
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
          orderIndex: startOrderIndex,
          itemIndex: offerIndex,
        },
      ],
      considerationComponents: [
        {
          orderIndex: startOrderIndex,
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
          orderIndex: startOrderIndex + 1,
          itemIndex: 0,
        },
      ],
      considerationComponents: [
        {
          orderIndex: startOrderIndex,
          itemIndex: considerationIndex,
        },
      ],
    });
  });

  return [...nftRelatedFulfillments, ...currencyRelatedFulfillments];
};

export const isPrivateOrder = (params: Types.OrderComponents) => {
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
};

export const isCosignedOrder = (params: Types.OrderComponents, chainId: number) =>
  // Only includes orders for which we can generate the signature locally.
  // Other types of cosigned orders (eg. OpenSea, Okx) should have special
  // handling at the router level for generating the cosignature.
  [BaseAddresses.ReservoirCancellationZone[chainId]].includes(params.zone);

export const constructPrivateListingCounterOrder = (
  orderMaker: string,
  privateSaleRecipient: string,
  conduitKey: string,
  params: Types.OrderComponents
): Types.OrderWithCounter => {
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

  return {
    parameters: {
      ...params,
      zone: AddressZero,
      conduitKey,
      orderType: 0,
      offerer: orderMaker,
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
};

export const constructOfferCounterOrderAndFulfillments = (
  params: Types.OrderComponents,
  taker: string,
  details: {
    counter: BigNumberish;
    tips: {
      recipient: string;
      amount: BigNumberish;
    }[];
    tokenId?: BigNumberish;
  }
): {
  order: Types.OrderWithCounter;
  fulfillments: Types.MatchOrdersFulfillment[];
} => {
  const quantity = params.consideration[0].startAmount;
  for (const tip of details.tips) {
    tip.amount = bn(tip.amount).mul(quantity).toString();
  }

  const netAmount = bn(params.offer[0].startAmount).sub(
    params.consideration
      .slice(1)
      .map((o) => bn(o.startAmount))
      .reduce((a, b) => a.add(b), bn(0))
  );
  const totalTips = details.tips.map((t) => bn(t.amount)).reduce((a, b) => a.add(b), bn(0));

  const counterOrderParameters = {
    ...params,
    offerer: taker,
    offer: [
      {
        itemType:
          params.consideration[0].itemType >= 4
            ? params.consideration[0].itemType - 2
            : params.consideration[0].itemType,
        token: params.consideration[0].token,
        identifierOrCriteria:
          details.tokenId?.toString() ?? params.consideration[0].identifierOrCriteria,
        startAmount: params.consideration[0].startAmount,
        endAmount: params.consideration[0].endAmount,
      },
    ],
    consideration: [
      {
        itemType: params.offer[0].itemType,
        token: params.offer[0].token,
        identifierOrCriteria: params.offer[0].identifierOrCriteria,
        startAmount: netAmount.sub(totalTips).toString(),
        endAmount: netAmount.sub(totalTips).toString(),
        recipient: taker,
      },
      ...details.tips.map((t) => ({
        itemType: params.offer[0].itemType,
        token: params.offer[0].token,
        identifierOrCriteria: params.offer[0].identifierOrCriteria,
        startAmount: bn(t.amount).toString(),
        endAmount: bn(t.amount).toString(),
        recipient: t.recipient,
      })),
    ],
    salt: generateRandomSalt(),
    counter: details.counter.toString(),
    orderType: Types.OrderType.PARTIAL_OPEN,
    totalOriginalConsiderationItems: details.tips.length + 1,
  };

  return {
    order: {
      parameters: counterOrderParameters,
      signature: "0x",
    },
    fulfillments: [
      // NFT
      {
        offerComponents: [
          {
            orderIndex: 1,
            itemIndex: 0,
          },
        ],
        considerationComponents: [
          {
            orderIndex: 0,
            itemIndex: 0,
          },
        ],
      },
      // Built-in fee payments
      ...params.consideration.slice(1).map((_, i) => ({
        offerComponents: [
          {
            orderIndex: 0,
            itemIndex: 0,
          },
        ],
        considerationComponents: [
          {
            orderIndex: 0,
            itemIndex: i + 1,
          },
        ],
      })),
      // Taker payment and tips
      ...counterOrderParameters.consideration.map((_, i) => ({
        offerComponents: [
          {
            orderIndex: 0,
            itemIndex: 0,
          },
        ],
        considerationComponents: [
          {
            orderIndex: 1,
            itemIndex: i,
          },
        ],
      })),
    ],
  };
};

export const computeDynamicPrice = (
  isBuy: boolean,
  params: Types.OrderComponents,
  timestampOverride?: number
) => {
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
};

export const constructListingCounterOrderAndFulfillments = (
  params: Types.OrderComponents,
  taker: string,
  startOrderIndex = 0
): {
  order: Types.OrderWithCounter;
  fulfillments: Types.MatchOrdersFulfillment[];
} => {
  const paymentItems = params.consideration.filter(
    (item) => item.recipient.toLowerCase() !== taker.toLowerCase()
  );

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

  const counterOrder = {
    parameters: {
      ...params,
      zone: AddressZero,
      orderType: 0,
      offerer: taker,
      offer: [
        {
          itemType: paymentItems[0].itemType,
          token: paymentItems[0].token,
          identifierOrCriteria: paymentItems[0].identifierOrCriteria,
          startAmount: aggregatedStartAmount.toString(),
          endAmount: aggregatedEndAmount.toString(),
        },
      ],
      consideration: params.offer.map((item) => {
        return {
          itemType: item.itemType,
          token: item.token,
          identifierOrCriteria: item.identifierOrCriteria,
          startAmount: item.startAmount.toString(),
          endAmount: item.endAmount.toString(),
          recipient: taker,
        };
      }),
      salt: generateRandomSalt(),
      totalOriginalConsiderationItems: params.offer.length,
    },
    signature: "0x",
  };

  return {
    order: counterOrder,
    fulfillments: getListingFulfillments(params, startOrderIndex),
  };
};

export const getListingFulfillments = (
  listingOrder: Types.OrderComponents,
  startOrderIndex = 0
): Types.MatchOrdersFulfillment[] => {
  const nftRelatedFulfillments: Types.MatchOrdersFulfillment[] = [];

  listingOrder.offer.forEach((_, offerIndex) => {
    nftRelatedFulfillments.push({
      offerComponents: [
        {
          orderIndex: startOrderIndex,
          itemIndex: offerIndex,
        },
      ],
      considerationComponents: [
        {
          orderIndex: startOrderIndex + 1,
          itemIndex: offerIndex,
        },
      ],
    });
  });

  const currencyRelatedFulfillments: Types.MatchOrdersFulfillment[] = [];

  listingOrder.consideration.forEach((considerationItem, considerationIndex) => {
    if (!isCurrencyItem(considerationItem)) {
      return;
    }

    currencyRelatedFulfillments.push({
      offerComponents: [
        {
          orderIndex: startOrderIndex + 1,
          itemIndex: 0,
        },
      ],
      considerationComponents: [
        {
          orderIndex: startOrderIndex,
          itemIndex: considerationIndex,
        },
      ],
    });
  });

  return [...nftRelatedFulfillments, ...currencyRelatedFulfillments];
};
