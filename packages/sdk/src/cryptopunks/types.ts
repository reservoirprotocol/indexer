import { BigNumberish } from "@ethersproject/bignumber";

export type OrderParams = {
  maker: string;
  side: "sell" | "buy";
  tokenId: BigNumberish;
  price: BigNumberish;
  taker?: string;
};
