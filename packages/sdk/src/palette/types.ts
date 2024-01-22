export type OrderParams = {
  side: "buy" | "sell";
  kind: "single-token" | "contract-wide";
  orderbook: string;
  collection: string;
  tokenId?: string;

  sellerOrBuyer: string; // address that made the offer
  price: string; // value of offer, uint160 because we use append 96 bits as a unique identifier during heap
  amount: string; // number of offers, this will be 1 for individual token bids for 721s. uint256 to be compatible with EIP721/1155

  // Listing
  privateBuyer?: string; // keep nil if no private buyer, will be ignored for 1155s
  deadline?: number;

  referrer: string; // referrers (marketaplces) can take fees on top
  feePercentage: number; // referrer fee
  hook: string; // hook address
};
