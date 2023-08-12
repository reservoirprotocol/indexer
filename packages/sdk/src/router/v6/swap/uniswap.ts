import { Interface, Result } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { Protocol } from "@uniswap/router-sdk";
import { Currency, CurrencyAmount, Ether, Percent, Token, TradeType } from "@uniswap/sdk-core";
import { AlphaRouter, SwapType } from "@uniswap/smart-order-router";

import { ExecutionInfo } from "../types";
import { isETH } from "../utils";
import { WNative } from "../../../common/addresses";
import { Network } from "../../../utils";
import { TransferDetail, SwapInfo } from "./index";

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

export const generateSwapExecutions = async (
  chainId: number,
  provider: Provider,
  fromTokenAddress: string,
  toTokenAddress: string,
  toTokenAmount: BigNumberish,
  options: {
    module: Contract;
    transfers: TransferDetail[];
    refundTo: string;
  }
): Promise<SwapInfo> => {
  const router = new AlphaRouter({
    chainId: chainId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider: provider as any,
  });

  // Uniswap's core SDK doesn't support MATIC -> WMATIC conversion
  // https://github.com/Uniswap/sdk-core/issues/39

  let fromToken = await getToken(chainId, provider, fromTokenAddress);
  if (chainId === Network.Polygon && isETH(chainId, fromTokenAddress)) {
    fromToken = await getToken(chainId, provider, WNative[chainId]);
  }

  let toToken = await getToken(chainId, provider, toTokenAddress);
  if (chainId === Network.Polygon && isETH(chainId, toTokenAddress)) {
    toToken = await getToken(chainId, provider, WNative[chainId]);
  }

  const route = await router.route(
    CurrencyAmount.fromRawAmount(toToken, toTokenAmount.toString()),
    fromToken,
    TradeType.EXACT_OUTPUT,
    {
      type: SwapType.SWAP_ROUTER_02,
      recipient: options.module.address,
      slippageTolerance: new Percent(5, 100),
      deadline: Math.floor(Date.now() / 1000 + 1800),
    },
    {
      protocols: [Protocol.V3],
      maxSwapsPerPath: 1,
      maxSplits: 1,
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
    module: options.module.address,
    data: options.module.interface.encodeFunctionData(
      fromETH ? "ethToExactOutput" : "erc20ToExactOutput",
      [
        {
          params: {
            tokenIn: params.params.tokenIn,
            tokenOut: params.params.tokenOut,
            fee: params.params.fee,
            recipient: options.module.address,
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
};
