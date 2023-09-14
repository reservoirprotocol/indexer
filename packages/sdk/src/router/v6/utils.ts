import { Interface } from "@ethersproject/abi";
import { BigNumberish } from "@ethersproject/bignumber";

import * as Sdk from "../../index";
import { MaxUint256, TxData } from "../../utils";

export const isETH = (chainId: number, address: string) =>
  [Sdk.Common.Addresses.Native[chainId], Sdk.ZeroExV4.Addresses.Native[chainId]].includes(
    address.toLowerCase()
  );

export const isWETH = (chainId: number, address: string) =>
  address.toLowerCase() === Sdk.Common.Addresses.WNative[chainId];

export const generateNFTApprovalTxData = (
  contract: string,
  owner: string,
  operator: string
): TxData => ({
  from: owner,
  to: contract,
  data: new Interface([
    "function setApprovalForAll(address operator, bool isApproved)",
  ]).encodeFunctionData("setApprovalForAll", [operator, true]),
});

export const generateFTApprovalTxData = (
  contract: string,
  owner: string,
  spender: string,
  amount?: BigNumberish
): TxData => ({
  from: owner,
  to: contract,
  data: new Interface(["function approve(address spender, uint256 amount)"]).encodeFunctionData(
    "approve",
    [spender, amount ?? MaxUint256]
  ),
});
