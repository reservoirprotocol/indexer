export type OrderParams = {
  pair: string;
  // Only relevant for listings
  tokenId?: string;
  amount?: string;
  extra: {
    // Array of prices the pool will sell/buy at
    prices: string[];
  };
};
