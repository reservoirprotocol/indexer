import fetch from "node-fetch";
import {
  BuySellItem,
  FeeItem,
  OrderbookOrderInput,
  OrderbookOrder,
  ItemTypeString,
  OrderTypeString,
  ORDER_TYPE_INT_TO_STRING,
  ORDER_TYPE_STRING_TO_INT,
  ITEM_TYPE_STRING_TO_INT,
  ITEM_TYPE_INT_TO_STRING,
  OrderbookFulfillmentData,
  FeeType,
} from "./types";
import { ImmutableValidationZone } from "./addresses";
import { ConsiderationItem, OfferItem, OrderComponents } from "../seaport-base/types";
import { Order as SeaportV15Order } from "../seaport-v1.5";
import { Exchange as SeaportExchange } from "../seaport-v1.5/addresses";
import { keccak256 } from "@ethersproject/keccak256";

const AddressZero = "0x0000000000000000000000000000000000000000";
const HashZero = "0x0000000000000000000000000000000000000000000000000000000000000000";

export const getImmutableConfig = (chainId: number) => {
  const config = {
    hostname: "api.sandbox.immutable.com",
    network: "imtbl-zkevm-testnet",
    seaportAddress: SeaportExchange[chainId],
    zone: ImmutableValidationZone[chainId],
    zoneHash: keccak256(ImmutableValidationZone[chainId]),
  };

  switch (chainId) {
    case 13473:
      return config;

    case 13371:
      return {
        ...config,
        hostname: "api.immutable.com",
        network: "imtbl-zkevm-mainnet",
      };

    default:
      throw new Error("Unsupported chain");
  }
};

export const getApiURL = (chainId: number, path?: string) => {
  const { network, hostname } = getImmutableConfig(chainId);
  return `https://${hostname}/v1/chains/${network}/orders${path || ""}`;
};

const sellItemToOffer = (sellItem: BuySellItem): OfferItem => ({
  startAmount: sellItem.amount || "1",
  endAmount: sellItem.amount || "1",
  itemType: ITEM_TYPE_STRING_TO_INT[sellItem.type],
  token: sellItem.contract_address ?? AddressZero,
  identifierOrCriteria: sellItem.token_id || "0",
});

const buyItemToConsideration = (buyItem: BuySellItem, recipient: string): ConsiderationItem => ({
  ...sellItemToOffer(buyItem),
  recipient,
});

const feeItemToConsideration = (fee: FeeItem, firstBuyItem: BuySellItem): ConsiderationItem => ({
  startAmount: fee.amount,
  endAmount: fee.amount,
  itemType: ITEM_TYPE_STRING_TO_INT[firstBuyItem.type],
  recipient: fee.recipient_address,
  token: firstBuyItem.type === ItemTypeString.ERC20 ? firstBuyItem.contract_address! : AddressZero,
  identifierOrCriteria: "0",
});

export const orderbookOrderToSeaport = (order: OrderbookOrder): OrderComponents | undefined => {
  if (!order || !order.protocol_data || order.protocol_data.seaport_version !== "1.5") {
    return undefined;
  }

  const offerItems = order.sell.map((item) => sellItemToOffer(item));
  const considerationItems = order.buy.map((item) =>
    buyItemToConsideration(item, order.account_address)
  );
  const feeConsiderationItems = order.fees.map((item) =>
    feeItemToConsideration(item, order.buy[0])
  );

  const signature = order.signature;
  const seaportOrderComponents: OrderComponents = {
    conduitKey: HashZero,
    consideration: [...considerationItems, ...feeConsiderationItems],
    offer: offerItems,
    counter: order.protocol_data.counter,
    endTime: Math.round(new Date(order.end_at).getTime() / 1000),
    startTime: Math.round(new Date(order.start_at).getTime() / 1000),
    salt: order.salt,
    offerer: order.account_address,
    zone: order.protocol_data.zone_address,
    totalOriginalConsiderationItems: considerationItems.length,
    orderType: ORDER_TYPE_STRING_TO_INT[order.protocol_data.order_type],
    zoneHash: HashZero,
    signature: signature && signature !== "0x" ? signature : undefined,
  };

  return seaportOrderComponents;
};

export const orderbookFulfillmentDataToSeaport = (
  data: OrderbookFulfillmentData
): (OrderComponents & { extraData?: string }) | undefined => {
  const seaportOrderComponents = orderbookOrderToSeaport(data.order);

  if (seaportOrderComponents) {
    return {
      ...seaportOrderComponents,
      extraData: data.extra_data,
    };
  }
};

const mapSeaportItem = (item: ConsiderationItem | OfferItem): BuySellItem => ({
  type: ITEM_TYPE_INT_TO_STRING[item.itemType],
  amount: item.startAmount,
  contract_address: item.token !== AddressZero ? item.token : undefined,
  token_id: item.identifierOrCriteria !== "0" ? item.identifierOrCriteria : undefined,
});

const hexToString = (hex: string): string =>
  hex.startsWith("0x") ? Buffer.from(hex.substring(2), "hex").toString() : hex;

/**
 * Orderbook API pre-validation.
 * Currently the API is severely limited, it supports ERC721 listings only.
 * This method needs to be extended when Immutable extends their API capabilities.
 */
const validateOrderbookInput = (order: OrderbookOrderInput) => {
  // `buy` can only contain NATIVE or ERC20, and only one of them (xor!)
  if (!order.buy.length) return false;

  let lastItemType = "";
  for (let i = 0; i < order.buy.length; i++) {
    const item = order.buy[0];

    // check general item type
    if (item.type !== ItemTypeString.NATIVE && item.type !== ItemTypeString.ERC20) {
      return false;
    }

    // check duplicates
    if (i > 0 && item.type !== lastItemType) {
      return false;
    }
    lastItemType = item.type;
  }

  // `sell` can only contain a single ERC721 (no criteria either)
  if (order.sell.length !== 1 || order.sell[0].type !== ItemTypeString.ERC721) {
    return false;
  }

  // `order_type` needs to be 'FULL_RESTRICTED'
  if (order.protocol_data.order_type !== OrderTypeString.FULL_RESTRICTED) {
    return false;
  }

  // require signature
  if (!order.signature || order.signature === "0x") {
    return false;
  }

  return true;
};

const validateSeaportOrder = (order: OrderComponents) => {
  const itemAmountsEqual = (item: OfferItem | ConsiderationItem) =>
    item.startAmount === item.endAmount;

  return (
    !order.consideration.map(itemAmountsEqual).includes(false) &&
    !order.offer.map(itemAmountsEqual).includes(false)
  );
};

export const seaportToOrderbookInput = (
  order: OrderComponents,
  chainId: number,
  ecosystemFees: FeeItem[] = [],
  validate = true
): OrderbookOrderInput | undefined => {
  const { seaportAddress } = getImmutableConfig(chainId);

  // check seaport amounts, they must match for orderbook
  if (validate && !validateSeaportOrder(order)) {
    return undefined;
  }

  // fees can't be part of the *signed* seaport order, they have to be added to the api call when creating it in Orderbook.
  // so we declare any (mistakenly added) fees as part of the price, though we should avoid this case on order creation.
  const buy: BuySellItem[] = order.consideration.map(mapSeaportItem);

  // create orderbook order
  const orderHash = new SeaportV15Order(chainId, order).hash();

  const orderbookInput: OrderbookOrderInput = {
    order_hash: orderHash,
    account_address: order.offerer,
    sell: order.offer.map(mapSeaportItem),
    buy,
    fees: ecosystemFees,
    start_at: new Date(order.startTime * 1000).toISOString(),
    end_at: new Date(order.endTime * 1000).toISOString(),
    protocol_data: {
      order_type: ORDER_TYPE_INT_TO_STRING[order.orderType],
      zone_address: order.zone, // this *must* be the same as getImmutableConfig(chainId).zone
      seaport_address: seaportAddress,
      seaport_version: "1.5",
      counter: hexToString(order.counter),
    },
    salt: order.salt,
    signature: order.signature || "0x",
  };

  // validate orderbook order
  if (validate && !validateOrderbookInput(orderbookInput)) {
    return undefined;
  }

  return orderbookInput;
};

export const isImmutable = (chainId: number) => {
  try {
    if (getImmutableConfig(chainId)) return true;
  } catch {}

  return false;
};

const validateZone = (orderZone: string, chainId: number) => {
  if (!isImmutable(chainId)) return false;
  if (getImmutableConfig(chainId).zone !== orderZone) return false;

  return true;
};

/**
 * Store Seaport order in Imtbl Orderbook
 */
export const storeInImtblOrderbook = async (
  chainId: number,
  seaportOrder: OrderComponents,
  feeBps: number,
  feeRecipient: string
): Promise<OrderComponents> => {
  // check if order should go to orderbook
  if (!validateZone(seaportOrder.zone, chainId)) return seaportOrder;

  // convert seaport order to OB input
  const orderbookInput = seaportToOrderbookInput(seaportOrder, chainId);
  if (!orderbookInput) throw new Error("Error converting Seaport order to Imtbl Orderbook input");

  // add platform fees to order input
  if (feeBps > 0) {
    let totalPrice = BigInt(0);
    orderbookInput.buy.forEach((buyItem) => {
      if (buyItem.amount) {
        totalPrice += BigInt(buyItem.amount);
      }
    });

    if (totalPrice > BigInt(0)) {
      orderbookInput.fees = [
        {
          amount: ((totalPrice * BigInt(feeBps)) / BigInt(10000)).toString(),
          type: FeeType.MAKER_ECOSYSTEM,
          recipient_address: feeRecipient,
        },
      ];
    }
  }

  // send input to OB
  const apiUrl = getApiURL(chainId, "/listings");
  const createResponse = await fetch(apiUrl, {
    method: "POST",
    body: JSON.stringify(orderbookInput),
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  const orderbookResult = (await createResponse.json()) as { result: OrderbookOrder };

  // convert order result back to seaport
  const orderComponents = orderbookOrderToSeaport(orderbookResult.result);
  if (!orderComponents) throw new Error("Error converting Imtbl Orderbook order to Seaport order");

  // return result to store in reservoir as `order.data`
  return orderComponents;
};
