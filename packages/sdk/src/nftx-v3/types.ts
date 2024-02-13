export type OrderParams = {
  vaultId: string;
  collection: string;
  pool: string;
  currency?: string;
  idsIn?: string[];
  amounts?: string[];
  price: string;
  executeCallData: string;
  deductRoyalty: boolean;
  idsOut?: string[];
  vTokenPremiumLimit?: string;
  extra?: {
    prices: string[];
    premiumPrice?: string;
  };
};
