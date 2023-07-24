import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { Provider } from "@ethersproject/abstract-provider";

import { ExecutionInfo } from "../types";
import { isETH, isWETH } from "../utils";
import * as oneInch from "./1inch";
import * as uniswap from "./uniswap";

export type SwapInfo = {
  amountIn: BigNumberish;
  executions: ExecutionInfo[];
};

export type TransferDetail = {
  recipient: string;
  amount: BigNumberish;
  toETH: boolean;
};

export const generateSwapExecutions = async (
  chainId: number,
  provider: Provider,
  swapProvider: string,
  fromTokenAddress: string,
  toTokenAddress: string,
  toTokenAmount: BigNumberish,
  options: {
    module: Contract;
    transfers: TransferDetail[];
    refundTo: string;
  }
): Promise<SwapInfo> => {
  if (isETH(chainId, fromTokenAddress) && isWETH(chainId, toTokenAddress)) {
    // We need to wrap ETH
    return {
      amountIn: toTokenAmount,
      executions: [
        {
          module: options.module.address,
          data: options.module.interface.encodeFunctionData("wrap", [options.transfers]),
          value: toTokenAmount,
        },
      ],
    };
  } else if (isWETH(chainId, fromTokenAddress) && isETH(chainId, toTokenAddress)) {
    // We need to unwrap WETH
    return {
      amountIn: toTokenAmount,
      executions: [
        {
          module: options.module.address,
          data: options.module.interface.encodeFunctionData("unwrap", [options.transfers]),
          value: 0,
        },
      ],
    };
  } else {
    return swapProvider === "uniswap"
      ? await uniswap.generateSwapExecutions(
          chainId,
          provider,
          fromTokenAddress,
          toTokenAddress,
          toTokenAmount,
          {
            module: options.module,
            transfers: options.transfers,
            refundTo: options.refundTo,
          }
        )
      : await oneInch.generateSwapExecutions(
          chainId,
          fromTokenAddress,
          toTokenAddress,
          toTokenAmount,
          {
            module: options.module,
            transfers: options.transfers,
            refundTo: options.refundTo,
          }
        );
  }
};
