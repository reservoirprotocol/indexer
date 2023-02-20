export type OrderKind = "single-token" | "collection-wide";

export enum Intent {
  SELL = 1,
  BUY = 3,
}

export enum DelegationType {
  ERC721 = 1,
  ERC1155 = 2,
}

export enum Op {
  INVALID,
  COMPLETE_SELL_OFFER,
  COMPLETE_BUY_OFFER,
  CANCEL_OFFER,
  BID,
  COMPLETE_AUCTION,
  REFUND_AUCTION,
  REFUND_AUCTION_STUCK_ITEM,
}

// Since X2Y2 is fully centralized, we depend on their APIs
// for everything (eg. filling/cancelling). Also, they only
// make available part of the order information.
export type Order = {
  kind?: OrderKind;
  id: number;
  type: string;
  currency: string;
  price: string;
  maker: string;
  taker: string;
  deadline: number;
  itemHash: string;
  nft: {
    token: string;
    tokenId?: string;
  };
  royalty_fee: number;
};

export type LocalOrder = {
  salt: string;
  user: string;
  network: number;
  intent: number;
  delegateType: number;
  deadline: number;
  currency: string;
  dataMask: string;
  items: { price: string; data: string }[];
  v?: number;
  r?: string;
  s?: string;
  signVersion: number;
};
