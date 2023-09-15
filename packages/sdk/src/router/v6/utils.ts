import { Interface } from "@ethersproject/abi";
import { BigNumberish } from "@ethersproject/bignumber";

import * as Sdk from "../../index";
import { MaxUint256, TxData } from "../../utils";
import { ListingDetails, PreSignature } from "./types";

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

export function generateVerfiedApprovals(details: ListingDetails[], taker: string) {
  const preSignatures: PreSignature[] = [];
  for (const detail of details) {
    if (!detail.erc721cSecurityLevel) continue;
    if ([4, 6].includes(detail.erc721cSecurityLevel)) {
      preSignatures.push({
        kind: "erc721c-verfied-eoa",
        signer: taker,
        uniqueId: `${detail.contract}-${taker}`,
        data: {
          signatureKind: "eip191",
          message: `EOA`,
          transferValidator: detail.transferValidator,
        },
      });
    }
  }
  return preSignatures;
}
