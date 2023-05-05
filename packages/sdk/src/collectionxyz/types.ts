export type OrderParams = {
  pool: string;
  // Only relevant for listings
  tokenId?: string;
  externalFilter: string;
  extra: {
    // Array of prices the pool will sell/buy at
    prices: string[];
  };
};
