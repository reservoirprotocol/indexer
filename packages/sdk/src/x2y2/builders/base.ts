import { BigNumberish } from "@ethersproject/bignumber";

export type BaseBuildParams = {
  user: string;
  network: number;
  side: "sell" | "buy";
  deadline: number;
  currency: string;
  price: BigNumberish;
  contract: string;
  salt?: BigNumberish;
};
