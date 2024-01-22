import { BigNumberish } from "@ethersproject/bignumber";

import { BaseOrderInfo } from "./builders/base";
import * as Types from "./types";
import { SeaportBaseExchange } from "../seaport-base/exchange";

export interface IOrder {
  chainId: number;
  params: Types.OrderComponents;
  externalId?: string;

  exchange(): SeaportBaseExchange;

  getInfo(): BaseOrderInfo | undefined;

  getMatchingPrice(timestampOverride?: number): BigNumberish;

  hash(): string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSignatureData(): any;

  isPrivateOrder(): boolean;
  constructPrivateListingCounterOrder(privateSaleRecipient: string): Types.OrderWithCounter;
  getPrivateListingFulfillments(): Types.MatchOrdersFulfillment[];
}

export const ORDER_EIP712_TYPES = {
  OrderComponents: [
    { name: "offerer", type: "address" },
    { name: "zone", type: "address" },
    { name: "offer", type: "OfferItem[]" },
    { name: "consideration", type: "ConsiderationItem[]" },
    { name: "orderType", type: "uint8" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "zoneHash", type: "bytes32" },
    { name: "salt", type: "uint256" },
    { name: "conduitKey", type: "bytes32" },
    { name: "counter", type: "uint256" },
  ],
  OfferItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
  ],
  ConsiderationItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
};
