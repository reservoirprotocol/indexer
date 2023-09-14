export type OrderParams = {
  vaultId: string;
  pool: string;
  collection: string;
  specificIds?: string[];
  amounts?: string[];
  amount?: string;
  path: string[];
  swapCallData?: string;
  currency?: string;
  price: string;
  extra: {
    prices: string[];
  };
};
