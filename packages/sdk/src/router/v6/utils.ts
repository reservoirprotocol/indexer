import { Interface } from "@ethersproject/abi";
import { BigNumberish } from "@ethersproject/bignumber";

import * as Sdk from "../../index";
import { MaxUint256, TxData } from "../../utils";
import { TxTags } from "./types";

export const isNative = (chainId: number, address: string) =>
  [Sdk.Common.Addresses.Native[chainId], Sdk.ZeroExV4.Addresses.Native[chainId]].includes(
    address.toLowerCase()
  );

export const isWNative = (chainId: number, address: string) =>
  address.toLowerCase() === Sdk.Common.Addresses.WNative[chainId];

export const isBETH = (chainId: number, address: string) =>
  address.toLowerCase() === Sdk.Blur.Addresses.Beth[chainId];

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

export const initializeTxTags = (): TxTags => ({
  listings: {},
  bids: {},
  mints: 0,
  swaps: 0,
  feesOnTop: 0,
});

export const estimateGasFromTxTags = (txTags: TxTags) => {
  const gasDb = {
    listing: 80000,
    bid: 80000,
    swap: 150000,
    mint: 50000,
    feeOnTop: 30000,
  };

  // Base gas cost per tx kind
  let estimate: number;
  if (txTags.mints) {
    estimate = 30000;
  } else if (txTags.listings && Object.keys(txTags.listings).length) {
    estimate = 80000;
  } else {
    estimate = 100000;
  }

  // Listings
  for (const count of Object.values(txTags.listings ?? {})) {
    estimate += Number(count) * gasDb.listing;
  }

  // Bids
  for (const count of Object.values(txTags.bids ?? {})) {
    estimate += Number(count) * gasDb.bid;
  }

  // Swaps
  if (txTags.swaps) {
    estimate += txTags.swaps * gasDb.swap;
  }

  // Mints
  if (txTags.mints) {
    estimate += txTags.mints * gasDb.mint;
  }

  // Fees on top
  if (txTags.feesOnTop) {
    estimate += txTags.feesOnTop * gasDb.mint;
  }

  return estimate;
};
