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

export type PendingAmountData = {
  offererPendingAmount: string;
  buyerPendingAmount: string;
  orderHash: string;
};

export enum OfferTokenType {
  ERC721,
  ERC1155,
}

export type OrderKind = "single-token" | "contract-wide";

// Everything that is not part of EIP712 types is optional
export type OrderParameters = {
  kind?: OrderKind;

  offerer: string;
  receiver?: string;
  offerItem: OfferItem;
  royalty: RoyaltyData;
  pendingAmountsData?: PendingAmountData;
  salt: number;
  orderSignature?: string;
  pendingAmountsSignature?: string;
  tokenType?: OfferTokenType;
};

export type PureOrder = {
  offerer: string;
  offerItem: OfferItem;
  royalty: RoyaltyData;
  salt: number;
};
