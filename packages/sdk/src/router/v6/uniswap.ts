import { Interface, Result } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { Protocol } from "@uniswap/router-sdk";
import { Currency, CurrencyAmount, Ether, Percent, Token, TradeType } from "@uniswap/sdk-core";
import { AlphaRouter, SwapType } from "@uniswap/smart-order-router";

import { ExecutionInfo } from "./types";
import { isETH, isWETH } from "./utils";
import { Weth } from "../../common/addresses";
import { Network } from "../../utils";

export type SwapInfo = {
  amountIn: BigNumberish;
  executions: ExecutionInfo[];
};

const getToken = async (
  chainId: number,
  provider: Provider,
  address: string
): Promise<Currency> => {
  const contract = new Contract(
    address,
    new Interface(["function decimals() view returns (uint8)"]),
    provider
  );

  return isETH(chainId, address)
    ? Ether.onChain(chainId)
    : new Token(chainId, address, await contract.decimals());
};

export type TransferDetail = {
  recipient: string;
  amount: BigNumberish;
  toETH: boolean;
};

export const generateSwapExecutions = async (
  chainId: number,
  provider: Provider,
  fromTokenAddress: string,
  toTokenAddress: string,
  toTokenAmount: BigNumberish,
  options: {
    swapModule: Contract;
    transfers: TransferDetail[];
    refundTo: string;
  }
): Promise<SwapInfo> => {
  const router = new AlphaRouter({
    chainId: chainId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider: provider as any,
  });

  if (isETH(chainId, fromTokenAddress) && isWETH(chainId, toTokenAddress)) {
    // We need to wrap ETH
    return {
      amountIn: toTokenAmount,
      executions: [
        {
          module: options.swapModule.address,
          data: options.swapModule.interface.encodeFunctionData("wrap", [options.transfers]),
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
          module: options.swapModule.address,
          data: options.swapModule.interface.encodeFunctionData("unwrap", [options.transfers]),
          value: 0,
        },
      ],
    };
  } else {
    // We need to swap

    // Uniswap's core SDK doesn't support MATIC -> WMATIC conversion
    // https://github.com/Uniswap/sdk-core/issues/39
    let fromToken = await getToken(chainId, provider, fromTokenAddress);
    if (chainId === Network.Polygon && isETH(chainId, fromTokenAddress)) {
      fromToken = await getToken(chainId, provider, Weth[chainId]);
    }

    const toToken = await getToken(chainId, provider, toTokenAddress);

    const route = await router.route(
      CurrencyAmount.fromRawAmount(toToken, toTokenAmount.toString()),
      fromToken,
      TradeType.EXACT_OUTPUT,
      {
        type: SwapType.SWAP_ROUTER_02,
        recipient: options.swapModule.address,
        slippageTolerance: new Percent(5, 100),
        deadline: Math.floor(Date.now() / 1000 + 1800),
      },
      {
        protocols: [Protocol.V3],
        maxSwapsPerPath: 1,
      }
    );

    if (!route) {
      throw new Error("Could not generate route");
    }

    // Currently the UniswapV3 module only supports 'exact-output-single' types of swaps
    const iface = new Interface([
      `function multicall(uint256 deadline, bytes[] calldata data)`,
      `
        function exactOutputSingle(
          tuple(
            address tokenIn,
            address tokenOut,
            uint24 fee,
            address recipient,
            uint256 amountOut,
            uint256 amountInMaximum,
            uint160 sqrtPriceLimitX96
          ) params
        )
      `,
    ]);

    let params: Result;
    try {
      // Properly handle multicall-wrapping
      let calldata = route.methodParameters!.calldata;
      if (calldata.startsWith(iface.getSighash("multicall"))) {
        const decodedMulticall = iface.decodeFunctionData("multicall", calldata);
        for (const data of decodedMulticall.data) {
          if (data.startsWith(iface.getSighash("exactOutputSingle"))) {
            calldata = data;
            break;
          }
        }
      }

      params = iface.decodeFunctionData("exactOutputSingle", calldata);
    } catch {
      throw new Error("Could not generate compatible route");
    }

    const fromETH = isETH(chainId, fromTokenAddress);

    const executions: ExecutionInfo[] = [];
    executions.push({
      module: options.swapModule.address,
      data: options.swapModule.interface.encodeFunctionData(
        fromETH ? "ethToExactOutput" : "erc20ToExactOutput",
        [
          {
            params: {
              tokenIn: params.params.tokenIn,
              tokenOut: params.params.tokenOut,
              fee: params.params.fee,
              recipient: options.swapModule.address,
              amountOut: params.params.amountOut,
              amountInMaximum: params.params.amountInMaximum,
              sqrtPriceLimitX96: params.params.sqrtPriceLimitX96,
            },
            transfers: options.transfers,
          },
          options.refundTo,
        ]
      ),
      value: fromETH ? params.params.amountInMaximum : 0,
    });

    return {
      amountIn: params.params.amountInMaximum.toString(),
      executions,
    };
  }
};
