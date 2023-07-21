import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";

import { ExecutionInfo } from "../types";
import { isETH } from "../utils";
import { Common, ZeroExV4 } from "../../../index";
import { bn } from "../../../utils";
import { TransferDetail, SwapInfo } from "./index";

const API_1INCH_ENDPOINT = "https://api.1inch.io";

export const generateSwapExecutions = async (
  chainId: number,
  fromTokenAddress: string,
  toTokenAddress: string,
  toTokenAmount: BigNumberish,
  options: {
    module: Contract;
    transfers: TransferDetail[];
    refundTo: string;
  }
): Promise<SwapInfo> => {
  const fromToken = isETH(chainId, fromTokenAddress)
    ? ZeroExV4.Addresses.Eth[chainId]
    : fromTokenAddress;
  const toToken = isETH(chainId, toTokenAddress) ? Common.Addresses.Weth[chainId] : toTokenAddress;

  const slippage = 10; // 0.01%
  const { data: quoteData } = await axios.get(`${API_1INCH_ENDPOINT}/v5.0/${chainId}/quote`, {
    params: {
      toTokenAddress: fromToken,
      fromTokenAddress: toToken,
      amount: bn(toTokenAmount)
        .add(bn(toTokenAmount).mul(slippage).div(bn(1000)))
        .toString(),
    },
  });

  const { data: swapData } = await axios.get(`${API_1INCH_ENDPOINT}/v5.0/${chainId}/swap`, {
    params: {
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      amount: quoteData.toTokenAmount,
      disableEstimate: true,
      fromAddress: options.module.address,
      slippage: slippage / 10,
    },
  });

  const fromETH = isETH(chainId, fromToken);

  const executions: ExecutionInfo[] = [];
  executions.push({
    module: options.module.address,
    data: options.module.interface.encodeFunctionData(
      fromETH ? "ethToExactOutput" : "erc20ToExactOutput",
      [
        {
          params: {
            tokenIn: fromToken,
            tokenOut: toToken,
            amountOut: swapData.toTokenAmount,
            amountInMaximum: swapData.fromTokenAmount,
            data: swapData.tx.data,
          },
          transfers: options.transfers,
        },
        options.refundTo,
      ]
    ),
    value: fromETH ? swapData.fromTokenAmount : 0,
  });

  return {
    amountIn: swapData.fromTokenAmount.toString(),
    executions,
  };
};
