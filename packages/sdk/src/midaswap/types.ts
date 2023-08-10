export type OrderParams = {
  pair: string;
  // Only relevant for listings
  tokenX: string; // NFT
  tokenY: string; // Token
  lpTokenId: string;
  pool: string; // `${pair}_${lpTokenId}`
  tokenId?: string;
  amount?: string;
  extra: {
    // Array of prices the pool will sell/buy at
    prices: string[];
    bins: number[];
    lpTokenIds: string[];
    floorPrice?: string;
  };
};
