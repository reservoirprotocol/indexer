import { Interface, Result } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { Protocol } from "@uniswap/router-sdk";
import { Currency, CurrencyAmount, Ether, Percent, Token, TradeType } from "@uniswap/sdk-core";
import { AlphaRouter, SwapOptionsUniversalRouter, SwapType } from "@uniswap/smart-order-router";
import { AddressZero } from "@ethersproject/constants";

import { ExecutionInfo } from "./types";
import { isETH, isWETH } from "./utils";
import { Weth } from "../../common/addresses";
import { Network } from "../../utils";
import { defaultAbiCoder } from "@ethersproject/abi";

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

    const swapOptions: SwapOptionsUniversalRouter = {
      type: SwapType.UNIVERSAL_ROUTER,
      recipient: options.swapModule.address,
      deadlineOrPreviousBlockhash: Math.floor(Date.now() / 1000 + 1800),
      slippageTolerance: new Percent(5, 100),
    };

    const route = await router.route(
      CurrencyAmount.fromRawAmount(toToken, toTokenAmount.toString()),
      fromToken,
      TradeType.EXACT_OUTPUT,
      swapOptions,
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
      `function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline)`,
    ]);

    let amountInMaximum;
    let executeCall: Result;

    try {
      // Properly handle execute-wrapping
      const calldata = route.methodParameters!.calldata;
      if (calldata.startsWith(iface.getSighash("execute"))) {
        executeCall = iface.decodeFunctionData("execute", calldata);
        const comands = executeCall.commands;

        let offset = 2;
        for (let index = 0; index < executeCall.inputs.length; index++) {
          const comand = comands.slice(offset, offset + 2);
          const input = executeCall.inputs[index];
          // V3_SWAP_EXACT_OUT
          if (comand === "01") {
            const [, , amountInMax, ,] = defaultAbiCoder.decode(
              ["address", "uint256", "uint256", "bytes", "bool"],
              input
            );
            amountInMaximum = amountInMax;
          }
          offset += 2;
        }
      }
    } catch (error) {
      throw new Error("Could not generate compatible route");
    }

    const fromETH = isETH(chainId, fromTokenAddress);

    const swapParams = {
      commands: executeCall!.commands,
      inputs: executeCall!.inputs,
      deadline: executeCall!.deadline,
      tokenIn: (fromToken as Token).address ?? AddressZero,
      tokenOut: (toToken as Token).address ?? AddressZero,
      amountInMaximum: amountInMaximum,
      fromTokenAddress,
      toTokenAddress,
      fromToken,
      toToken,
    };

    const executions: ExecutionInfo[] = [];
    executions.push({
      module: options.swapModule.address,
      data: options.swapModule.interface.encodeFunctionData(
        fromETH ? "ethToExactOutput" : "erc20ToExactOutput",
        [
          {
            params: swapParams,
            transfers: options.transfers,
          },
          options.refundTo,
        ]
      ),
      value: fromETH ? amountInMaximum : 0,
    });

    return {
      amountIn: amountInMaximum.toString(),
      executions,
    };
  }
};
