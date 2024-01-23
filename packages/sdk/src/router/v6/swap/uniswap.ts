import { Interface, Result } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { Protocol } from "@uniswap/router-sdk";
import { Currency, CurrencyAmount, Ether, Percent, Token, TradeType } from "@uniswap/sdk-core";
import { AlphaRouter, SwapRoute, SwapType } from "@uniswap/smart-order-router";

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

export const generateBuyExecutions = async (
  chainId: number,
  provider: Provider,
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: BigNumberish,
  options: {
    module: Contract;
    transfers: TransferDetail[];
    refundTo: string;
    revertIfIncomplete: boolean;
  }
): Promise<SwapInfo> => {
  return _generateSwapExecutions(chainId, provider, fromTokenAddress, toTokenAddress, amount, {
    direction: "buy",
    ...options,
  });
};

export const generateSellExecutions = async (
  chainId: number,
  provider: Provider,
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: BigNumberish,
  options: {
    module: Contract;
    transfers: TransferDetail[];
    refundTo: string;
    revertIfIncomplete: boolean;
  }
): Promise<SwapInfo> => {
  return _generateSwapExecutions(chainId, provider, fromTokenAddress, toTokenAddress, amount, {
    direction: "sell",
    ...options,
  });
};

const _generateSwapExecutions = async (
  chainId: number,
  provider: Provider,
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: BigNumberish,
  options: {
    direction: "sell" | "buy";
    module: Contract;
    transfers: TransferDetail[];
    refundTo: string;
    revertIfIncomplete: boolean;
  }
): Promise<SwapInfo> => {
  const router = new AlphaRouter({
    chainId: chainId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider: provider as any,
  });

  const isBuy = options.direction === "buy";

  // Uniswap's core SDK doesn't support Native -> WNative conversions on some chains
  // TODO: Updating to the latest version of the core SDK could fix it
  // https://github.com/Uniswap/sdk-core/issues/39

  let fromToken = await getToken(chainId, provider, fromTokenAddress);
  let toToken = await getToken(chainId, provider, toTokenAddress);
  if ([Network.Polygon, Network.Mumbai, Network.EthereumSepolia].includes(chainId)) {
    if (isETH(chainId, fromTokenAddress)) {
      fromToken = await getToken(chainId, provider, WNative[chainId]);
    }
    if (isETH(chainId, toTokenAddress)) {
      toToken = await getToken(chainId, provider, WNative[chainId]);
    }
  }

  let route: SwapRoute | null = null;
  try {
    route = await router.route(
      CurrencyAmount.fromRawAmount(!isBuy ? fromToken : toToken, amount.toString()),
      !isBuy ? toToken : fromToken,
      !isBuy ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
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
  } catch {
    // Skip errors
  }

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
    `
      function exactInputSingle(
        tuple(
          address tokenIn,
          address tokenOut,
          uint24 fee,
          address recipient,
          uint256 amountIn,
          uint256 amountOutMinimum,
          uint160 sqrtPriceLimitX96
        ) params
      )
    `,
  ]);

  let params: Result;
  try {
    const callMethod = isBuy ? "exactOutputSingle" : "exactInputSingle";

    // Properly handle multicall-wrapping
    let calldata = route.methodParameters!.calldata;
    if (calldata.startsWith(iface.getSighash("multicall"))) {
      const decodedMulticall = iface.decodeFunctionData("multicall", calldata);
      for (const data of decodedMulticall.data) {
        if (data.startsWith(iface.getSighash(callMethod))) {
          calldata = data;
          break;
        }
      }
    }

    params = iface.decodeFunctionData(callMethod, calldata);
  } catch {
    throw new Error("Could not generate compatible route");
  }

  const fromETH = isETH(chainId, fromTokenAddress);
  const execution = {
    module: options.module.address,
    data: options.module.interface.encodeFunctionData(
      isBuy ? (fromETH ? "ethToExactOutput" : "erc20ToExactOutput") : "erc20ToExactInput",
      [
        [
          {
            params: isBuy
              ? {
                  tokenIn: params.params.tokenIn,
                  tokenOut: params.params.tokenOut,
                  fee: params.params.fee,
                  recipient: options.module.address,
                  amountOut: params.params.amountOut,
                  amountInMaximum: params.params.amountInMaximum,
                  sqrtPriceLimitX96: params.params.sqrtPriceLimitX96,
                }
              : {
                  tokenIn: params.params.tokenIn,
                  tokenOut: params.params.tokenOut,
                  fee: params.params.fee,
                  recipient: options.module.address,
                  amountIn: params.params.amountIn,
                  amountOutMinimum: params.params.amountOutMinimum,
                  sqrtPriceLimitX96: params.params.sqrtPriceLimitX96,
                },
            transfers: options.transfers,
          },
        ],
        options.refundTo,
        options.revertIfIncomplete,
      ]
    ),
    value: isBuy ? (fromETH ? params.params.amountInMaximum : 0) : 0,
  };

  return {
    tokenIn: fromTokenAddress,
    amountIn: isBuy ? params.params.amountInMaximum.toString() : amount,
    amountOut: isBuy ? amount : params.params.amountOutMinimum.toString(),
    module: options.module,
    execution,
    kind: "swap",
  };
};
