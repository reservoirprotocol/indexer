import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { Provider } from "@ethersproject/abstract-provider";

import { bn } from "../../../utils";
import { ExecutionInfo } from "../types";
import { isETH, isWETH } from "../utils";
import * as oneInch from "./1inch";
import * as uniswap from "./uniswap";

export type SwapInfo = {
  tokenIn: string;
  amountIn: BigNumberish;
  amountOut?: BigNumberish;
  module: Contract;
  execution: ExecutionInfo;
  kind: "wrap-or-unwrap" | "swap";
};

export type TransferDetail = {
  recipient: string;
  amount: BigNumberish;
  toETH: boolean;
};

export const generateSwapInfo = async (
  chainId: number,
  provider: Provider,
  swapProvider: string,
  fromTokenAddress: string,
  toTokenAddress: string,
  toTokenAmount: BigNumberish,
  options: {
    direction: "sell" | "buy";
    module: Contract;
    transfers: TransferDetail[];
    refundTo: string;
    revertIfIncomplete: boolean;
  }
): Promise<SwapInfo> => {
  if (isETH(chainId, fromTokenAddress) && isWETH(chainId, toTokenAddress)) {
    // We need to wrap ETH
    return {
      tokenIn: fromTokenAddress,
      amountIn: toTokenAmount,
      module: options.module,
      execution: {
        module: options.module.address,
        data: options.module.interface.encodeFunctionData("wrap", [options.transfers]),
        value: toTokenAmount,
      },
      kind: "wrap-or-unwrap",
    };
  } else if (isWETH(chainId, fromTokenAddress) && isETH(chainId, toTokenAddress)) {
    // We need to unwrap WETH
    return {
      tokenIn: fromTokenAddress,
      amountIn: toTokenAmount,
      module: options.module,
      execution: {
        module: options.module.address,
        data: options.module.interface.encodeFunctionData("unwrap", [options.transfers]),
        value: 0,
      },
      kind: "wrap-or-unwrap",
    };
  } else {
    if (options.direction === "buy") {
      return swapProvider === "uniswap"
        ? uniswap.generateBuyExecutions(
            chainId,
            provider,
            fromTokenAddress,
            toTokenAddress,
            toTokenAmount,
            {
              module: options.module,
              transfers: options.transfers,
              refundTo: options.refundTo,
              revertIfIncomplete: options.revertIfIncomplete,
            }
          )
        : oneInch.generateBuyExecutions(chainId, fromTokenAddress, toTokenAddress, toTokenAmount, {
            module: options.module,
            transfers: options.transfers,
            refundTo: options.refundTo,
            revertIfIncomplete: options.revertIfIncomplete,
          });
    } else {
      return uniswap.generateSellExecutions(
        chainId,
        provider,
        fromTokenAddress,
        toTokenAddress,
        toTokenAmount,
        {
          module: options.module,
          transfers: options.transfers,
          refundTo: options.refundTo,
          revertIfIncomplete: options.revertIfIncomplete,
        }
      );
    }
  }
};

export const mergeSwapInfos = (
  chainId: number,
  infos: SwapInfo[],
  direction: "sell" | "buy"
): SwapInfo[] => {
  const results: SwapInfo[] = [];

  const tokenInToSwapInfos: { [tokenIn: string]: SwapInfo[] } = {};
  for (const info of infos) {
    if (info.kind === "wrap-or-unwrap") {
      // `wrap-or-unwrap` executions go through directly
      results.push(info);
    } else {
      if (!tokenInToSwapInfos[info.tokenIn]) {
        tokenInToSwapInfos[info.tokenIn] = [];
      }
      tokenInToSwapInfos[info.tokenIn].push(info);
    }
  }

  // Anything else (eg. `swap` executions) needs to be merged together
  for (const [tokenIn, infos] of Object.entries(tokenInToSwapInfos)) {
    const fromETH = isETH(chainId, tokenIn);

    const decodedExecutionData = infos.map((info) =>
      info.module.interface.decodeFunctionData(
        direction === "buy"
          ? fromETH
            ? "ethToExactOutput"
            : "erc20ToExactOutput"
          : "erc20ToExactInput",
        info.execution.data
      )
    );

    results.push({
      tokenIn,
      amountIn: infos.map((info) => bn(info.amountIn)).reduce((a, b) => a.add(b)),
      module: infos[0].module,
      kind: infos[0].kind,
      execution: {
        module: infos[0].execution.module,
        data: infos[0].module.interface.encodeFunctionData(
          direction === "buy"
            ? fromETH
              ? "ethToExactOutput"
              : "erc20ToExactOutput"
            : "erc20ToExactInput",
          [
            // TODO: Aggregate same token and same recipient transfers
            decodedExecutionData.map((d) => d.swaps).flat(),
            decodedExecutionData[0].refundTo,
            decodedExecutionData[0].revertIfIncomplete,
          ]
        ),
        value: infos.map((info) => bn(info.execution.value)).reduce((a, b) => a.add(b)),
      },
    });
  }

  return results;
};
