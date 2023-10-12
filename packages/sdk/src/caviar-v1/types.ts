export type OrderParams = {
  pool: string;
  tokenId?: string;
  tokenAddress?: string;
  extra: {
    prices: string[];
  };
};
