import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";

import { isNative } from "../utils";
import { Common, ZeroExV4 } from "../../../index";
import { bn } from "../../../utils";
import { TransferDetail, SwapInfo } from "./index";

const API_1INCH_ENDPOINT = "https://api.1inch.dev";
const API_1INCH_KEY = "HcGeL2tXZQ8kNtzn2BYSjIX2rkKNKwN0";

export const generateBuyExecutions = async (
  chainId: number,
  fromTokenAddress: string,
  toTokenAddress: string,
  toTokenAmount: BigNumberish,
  options: {
    module: Contract;
    transfers: TransferDetail[];
    refundTo: string;
    revertIfIncomplete: boolean;
  }
): Promise<SwapInfo> => {
  const fromToken = isNative(chainId, fromTokenAddress)
    ? ZeroExV4.Addresses.Native[chainId]
    : fromTokenAddress;
  const toToken = isNative(chainId, toTokenAddress)
    ? Common.Addresses.WNative[chainId]
    : toTokenAddress;

  const slippage = 10; // 0.01%
  const { data: quoteData } = await axios.get(`${API_1INCH_ENDPOINT}/swap/v5.2/${chainId}/quote`, {
    params: {
      src: toToken,
      dst: fromToken,
      amount: bn(toTokenAmount)
        .add(bn(toTokenAmount).mul(slippage).div(bn(1000)))
        .toString(),
    },
    headers: {
      Authorization: `Bearer ${API_1INCH_KEY}`,
    },
  });

  // Wait 1 second to avoid rate-limiting
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const fromAmount = quoteData.toAmount;
  const { data: swapData } = await axios.get(`${API_1INCH_ENDPOINT}/swap/v5.2/${chainId}/swap`, {
    params: {
      src: fromToken,
      dst: toToken,
      amount: fromAmount,
      disableEstimate: true,
      from: options.module.address,
      slippage: slippage / 10,
    },
    headers: {
      Authorization: `Bearer ${API_1INCH_KEY}`,
    },
  });

  const fromETH = isNative(chainId, fromToken);
  const execution = {
    module: options.module.address,
    data: options.module.interface.encodeFunctionData(
      fromETH ? "ethToExactOutput" : "erc20ToExactOutput",
      [
        [
          {
            params: {
              tokenIn: fromToken,
              tokenOut: toToken,
              amountOut: swapData.toAmount,
              amountInMaximum: fromAmount,
              data: swapData.tx.data,
            },
            transfers: options.transfers,
          },
        ],
        options.refundTo,
        options.revertIfIncomplete,
      ]
    ),
    value: fromETH ? fromAmount : 0,
  };

  return {
    tokenIn: fromTokenAddress,
    amountIn: fromAmount,
    module: options.module,
    execution,
    kind: "swap",
  };
};
