export type OrderKind =
  | "sale-approval"
  | "item-offer-approval"
  | "collection-offer-approval"
  | "token-set-offer-approval";

export enum OrderProtocols {
  ERC721_FILL_OR_KILL,
  ERC1155_FILL_OR_KILL,
  ERC1155_FILL_PARTIAL,
}

export type SignatureECDSA = {
  v: number;
  r: string;
  s: string;
};

export type Cosignature = {
  signer: string;
  taker: string;
  expiration: number;
  v: number;
  r: string;
  s: string;
};

export type MatchedOrder = {
  protocol: OrderProtocols;
  maker: string;
  beneficiary: string;
  marketplace: string;
  paymentMethod: string;
  tokenAddress: string;
  tokenId: string;
  amount: string;
  itemPrice: string;
  nonce: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  maxRoyaltyFeeNumerator: string;
  requestedFillAmount: string;
  minimumFillAmount: string;
  signature: SignatureECDSA;
};

export type SweepOrder = {
  protocol: OrderProtocols;
  tokenAddress: string;
  paymentMethod: string;
  beneficiary: string;
};

export type SweepItem = {
  maker: string;
  marketplace: string;
  tokenId: string;
  amount: string;
  itemPrice: string;
  nonce: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  maxRoyaltyFeeNumerator: string;
};

export type SweepOrderParams = {
  sweepOrder: SweepOrder;
  items: SweepItem[];
  signedSellOrders: SignatureECDSA[];
  cosignatures: Cosignature[];
};

// Type for generic order format

export type BaseOrder = {
  kind?: OrderKind;
  protocol: OrderProtocols;
  cosigner?: string;
  sellerOrBuyer: string;
  marketplace: string;
  paymentMethod: string;
  tokenAddress: string;
  amount: string;
  itemPrice: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  nonce: string;
  masterNonce: string;

  // "sale-approval" only
  maxRoyaltyFeeNumerator?: string;

  // "*-offer-approval" only
  beneficiary?: string;

  // "sale-approval" and "item-offer-approval" only
  tokenId?: string;

  // "token-set-offer-approval" only
  tokenSetMerkleRoot?: string;

  cosignature?: Cosignature;

  v?: number;
  r?: string;
  s?: string;
};

// Types per individual order format

export type SaleApproval = {
  protocol: OrderProtocols;
  cosigner: string;
  seller: string;
  marketplace: string;
  paymentMethod: string;
  tokenAddress: string;
  tokenId: string;
  amount: string;
  itemPrice: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  maxRoyaltyFeeNumerator: string;
  nonce: string;
  masterNonce: string;
};

export type ItemOfferApproval = {
  protocol: OrderProtocols;
  cosigner: string;
  buyer: string;
  beneficiary: string;
  marketplace: string;
  paymentMethod: string;
  tokenAddress: string;
  tokenId: string;
  amount: string;
  itemPrice: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  nonce: string;
  masterNonce: string;
};

export type CollectionOfferApproval = {
  protocol: OrderProtocols;
  cosigner: string;
  buyer: string;
  beneficiary: string;
  marketplace: string;
  paymentMethod: string;
  tokenAddress: string;
  amount: string;
  itemPrice: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  nonce: string;
  masterNonce: string;
};

export type TokenSetOfferApproval = {
  protocol: OrderProtocols;
  cosigner: string;
  buyer: string;
  beneficiary: string;
  marketplace: string;
  paymentMethod: string;
  tokenAddress: string;
  amount: string;
  itemPrice: string;
  expiration: string;
  marketplaceFeeNumerator: string;
  nonce: string;
  masterNonce: string;
  tokenSetMerkleRoot: string;
};
