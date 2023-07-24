enum AssetType {
  ERC721,
  ERC1155,
}

enum OrderType {
  ASK,
  BID,
}

type FeeRate = {
  recipient: string;
  rate: number;
};

export type BaseOrder = {
  trader: string;
  collection: string;
  listingsRoot: string;
  numberOfListings: string;
  expirationTime: string;
  assetType: AssetType;
  makerFee: FeeRate;
  salt: string;
  orderType: OrderType;
  nonce: string;
};
