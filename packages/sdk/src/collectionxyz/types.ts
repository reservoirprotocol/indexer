export type OrderParams = {
  pool: string;
  // Only relevant for listings
  tokenId?: string;
  externalFilter: string;
  // Set of tokenIds accepted by the merkle root of this pool. [] for buy orders
  // (buy from pool) as proofs aren't needed when buying, or sell orders for
  // unfiltered pools
  acceptedSet: string[];
  extra: {
    // Array of prices the pool will sell/buy at
    prices: string[];
  };
};
