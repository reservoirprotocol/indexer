export type OfferItem = {
  offerToken: string;
  offerTokenId: string;
  offerAmount: string;
  endTime: number;
  amount: number;
};

export type RoyaltyData = {
  royaltyPercent: number;
  royaltyRecipient: string;
};

export enum OfferTokenType {
  ERC721,
  ERC1155,
}

export type OrderKind = "single-token" | "contract-wide";

// Everything that is not part of EIP712 types is optional
export type OrderParameters = {
  kind?: OrderKind;
  currency?: string;

  offerer: string;
  receiver?: string;
  offerItem: OfferItem;
  royalty: RoyaltyData;
  salt: number;
  orderSignature?: string;
  tokenType?: OfferTokenType;
};

export type PureOrder = {
  offerer: string;
  offerItem: OfferItem;
  royalty: RoyaltyData;
  salt: number;
};

export const EIP712_TYPES = {
  Order: [
    { name: "offerer", type: "address" },
    { name: "offerItem", type: "OfferItem" },
    { name: "royalty", type: "RoyaltyData" },
    { name: "salt", type: "uint256" },
  ],
  OfferItem: [
    { name: "offerToken", type: "address" },
    { name: "offerTokenId", type: "uint256" },
    { name: "offerAmount", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "amount", type: "uint256" },
  ],
  RoyaltyData: [
    { name: "royaltyPercent", type: "uint256" },
    { name: "royaltyRecipient", type: "address" },
  ],
};
