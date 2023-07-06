export enum TokenProtocols {
  ERC721,
  ERC1155,
}

export type OrderKind = "sale-approval" | "offer-approval" | "collection-offer-approval";
export type MatchedOrder = {
  sellerAcceptedOffer: boolean;
  collectionLevelOffer: boolean;
  protocol: TokenProtocols;
  paymentCoin: string;
  tokenAddress: string;
  seller: string;
  privateBuyer: string;
  buyer: string;
  delegatedPurchaser: string;
  marketplace: string;
  marketplaceFeeNumerator: string;
  maxRoyaltyFeeNumerator: string;
  listingNonce: string;
  offerNonce: string;
  listingMinPrice: string;
  offerPrice: string;
  listingExpiration: string;
  offerExpiration: string;
  tokenId: string;
  amount: string;
  listingSignature: {
    v: number;
    r: string;
    s: string;
  };
  offerSignature: {
    v: number;
    r: string;
    s: string;
  };
};

export type BaseOrder = {
  kind?: OrderKind;
  protocol: number;
  marketplace: string;
  marketplaceFeeNumerator: string;
  tokenAddress: string;
  tokenId?: string;
  amount: string;
  price: string;
  expiration: string;
  nonce: string;
  masterNonce: string;
  coin: string;

  privateBuyerOrDelegatedPurchaser: string;
  sellerOrBuyer: string;

  // `SaleApproval`-only fields
  sellerAcceptedOffer?: boolean;
  maxRoyaltyFeeNumerator?: string;

  // `CollectionOfferApproval`-only fields
  collectionLevelOffer?: boolean;

  v?: number;
  r?: string;
  s?: string;
};

export type SaleApproval = {
  protocol: TokenProtocols;
  sellerAcceptedOffer: boolean;
  marketplace: string;
  marketplaceFeeNumerator: string;
  maxRoyaltyFeeNumerator: string;
  privateBuyer: string;
  seller: string;
  tokenAddress: string;
  tokenId: string;
  amount: string;
  minPrice: string;
  expiration: string;
  nonce: string;
  masterNonce: string;
  coin: string;
};

export type OfferApproval = {
  protocol: number;
  marketplace: string;
  marketplaceFeeNumerator: string;
  delegatedPurchaser: string;
  buyer: string;
  tokenAddress: string;
  tokenId: string;
  amount: string;
  price: string;
  expiration: string;
  nonce: string;
  masterNonce: string;
  coin: string;
};

export type CollectionOfferApproval = {
  protocol: number;
  collectionLevelOffer: boolean;
  marketplace: string;
  marketplaceFeeNumerator: string;
  delegatedPurchaser: string;
  buyer: string;
  tokenAddress: string;
  amount: string;
  price: string;
  expiration: string;
  nonce: string;
  masterNonce: string;
  coin: string;
};
