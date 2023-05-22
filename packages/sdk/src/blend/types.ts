import { BigNumberish } from "@ethersproject/bignumber";

export type OrderParams = {
  borrower: string;
  lienId: string;
  price: string;
  expirationTime: string;
  salt: string;
  oracle: string;
  fees: {
    rate: number;
    recipient: string;
  }[];
  nonce: string;
  signature?: string;
  lien?: Lien;
};

export type Lien = {
  lender: string;
  borrower: string;
  collection: string;
  tokenId: BigNumberish;
  amount: BigNumberish;
  rate: BigNumberish;
  auctionStartBlock: BigNumberish;
  startTime: BigNumberish;
  auctionDuration: BigNumberish;
};
