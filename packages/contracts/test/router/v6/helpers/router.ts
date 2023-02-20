import { BigNumberish } from "@ethersproject/bignumber";

export type ExecutionInfo = {
  module: string;
  data: string;
  value: BigNumberish;
};
