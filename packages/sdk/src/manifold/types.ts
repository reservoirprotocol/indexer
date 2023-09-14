export enum ListingType {
  INVALID,
  INDIVIDUAL_AUCTION,
  FIXED_PRICE,
  DYNAMIC_PRICE,
  RANKED_AUCTION,
}

export enum Spec {
  NONE,
  ERC721,
  ERC1155,
}

export type Order = {
  id: string;
  seller: string;
  marketplaceBPS: number;
  referrerBPS: number;
  details: Details;
  token: TokenDetails;
  fees: DeliveryFees;
};

export type Details = {
  initialAmount: string;
  type_: ListingType;
  totalAvailable: number;
  totalPerSale: number;
  extensionInterval: number;
  minIncrementBPS: number;
  erc20: string;
  identityVerifier: string;
  startTime: number;
  endTime: number;
};

export type DeliveryFees = {
  deliverFixed: number;
  deliverBPS: number;
};

export type TokenDetails = {
  id: string;
  address_: string;
  spec: Spec;
  lazy: boolean;
};
