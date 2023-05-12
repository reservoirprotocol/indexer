export type OrderParams = {
  pool: string;
  // Only relevant for listings
  tokenId?: string;
  externalFilter: string;
  // Only defined if this is a filtered bid
  tokenSetId: string | undefined;
  royaltyRecipientFallback: string;
  // assetRecipient === pool for TRADE pools
  assetRecipient: string;
  extra: {
    // Array of prices the pool will sell/buy at
    prices: string[];
  };
};
