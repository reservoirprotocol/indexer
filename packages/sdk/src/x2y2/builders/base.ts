import { BigNumberish } from "@ethersproject/bignumber";

import * as Types from "../types";

export type BaseBuildParams = {
  user: string;
  network: number;
  side: "sell" | "buy";
  deadline: number;
  currency: string;
  price: BigNumberish;
  amount?: BigNumberish;
  delegateType?: Types.DelegationType;
  contract: string;
  salt?: BigNumberish;
  taker?: string;
};
