import { BigNumberish } from "@ethersproject/bignumber";
import { parseEther } from "@ethersproject/units";
import { Wallet } from "@ethersproject/wallet";
import { getCallTrace, getStateChange } from "@georgeroman/evm-tx-simulator";
import { TxData } from "@reservoir0x/sdk/dist/utils";

import { bn, now } from "@/common/utils";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";

export const genericTaker = "0x0000000000000000000000000000000000000001";
export const customTaker = () => {
  if (config.customTakerPrivateKey) {
    return new Wallet(config.customTakerPrivateKey);
  }

  throw new Error("Simulation not supported");
};

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
      blockOverrides: {
        timestamp: now(),
      },
    },
    baseProvider,
    { skipReverts: true }
  );
  if (callTrace.error) {
    return {
      result: false,
      callTrace,
    };
  }

  const result = getStateChange(callTrace);

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
      blockOverrides: {
        timestamp: now(),
      },
    },
    baseProvider,
    { skipReverts: true }
  );
  if (callTrace.error) {
    return {
      result: false,
      callTrace,
    };
  }

  const result = getStateChange(callTrace);

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
