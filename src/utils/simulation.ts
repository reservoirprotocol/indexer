/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumberish } from "@ethersproject/bignumber";
import { JsonRpcProvider } from "@ethersproject/providers";
import { parseEther } from "@ethersproject/units";
import { getCallTrace, parseCallTrace } from "@georgeroman/evm-tx-simulator";
import { TxData } from "@reservoir0x/sdk/dist/utils";

import { bn } from "@/common/utils";
import { config } from "@/config/index";

export const genericTaker = "0x0000000000000000000000000000000000000001";

// Simulate the buy transaction
export const ensureBuyTxSucceeds = async (
  taker: string,
  token: {
    kind: "erc721" | "erc1155";
    contract: string;
    tokenId: BigNumberish;
    amount: BigNumberish;
  },
  tx: TxData
) => {
  const provider = new JsonRpcProvider(config.traceNetworkHttpUrl);
  const callTrace = await getCallTrace(
    {
      from: tx.from,
      to: tx.to,
      data: tx.data,
      value: tx.value ?? 0,
      gas: 10000000,
      gasPrice: 0,
      balanceOverrides: {
        [taker]: tx.value ?? 0,
      },
    },
    provider,
    { skipReverts: true }
  );
  if (callTrace.error) {
    return {
      result: false,
      callTrace,
    };
  }

  const result = parseCallTrace(callTrace);

  if (
    result[taker].tokenBalanceState[`${token.kind}:${token.contract}:${token.tokenId}`] !==
    bn(token.amount).toString()
  ) {
    return {
      result: false,
      callTrace,
    };
  }

  return {
    result: true,
    callTrace,
  };
};

// Simulate the sell transaction
export const ensureSellTxSucceeds = async (
  taker: string,
  token: {
    kind: "erc721" | "erc1155";
    contract: string;
    tokenId: BigNumberish;
    amount: BigNumberish;
  },
  tx: TxData
) => {
  const provider = new JsonRpcProvider(config.traceNetworkHttpUrl);

  const callTrace = await getCallTrace(
    {
      from: tx.from,
      to: tx.to,
      data: tx.data,
      value: 0,
      gas: 10000000,
      gasPrice: 0,
      balanceOverrides: {
        // For gas cost
        [taker]: parseEther("0.1"),
      },
    },
    provider,
    { skipReverts: true }
  );
  if (callTrace.error) {
    return {
      result: false,
      callTrace,
    };
  }

  const result = parseCallTrace(callTrace);

  if (
    result[taker].tokenBalanceState[`${token.kind}:${token.contract}:${token.tokenId}`] !==
    bn(token.amount).mul(-1).toString()
  ) {
    return {
      result: false,
      callTrace,
    };
  }

  return {
    result: true,
    callTrace,
  };
};
