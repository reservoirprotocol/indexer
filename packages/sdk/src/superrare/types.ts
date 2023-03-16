export type OrderParams = {
  maker: string;
  contract: string;
  tokenId: string;
  price: string;
  currency: string;
  splitAddresses: string[];
  splitRatios: number[];
};
