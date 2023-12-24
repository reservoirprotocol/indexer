import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import axios from "axios";

import * as Addresses from "./addresses";
import * as Common from "../common";
import { bn } from "../utils";

const ZEROEX_ENDPOINT = "https://api.0x.org";

const UNIT = parseEther("1");

export const getPoolFeatures = async (address: string, provider: Provider) => {
  const iface = new Interface([
    "function assetAddress() view returns (address)",
    "function is1155() view returns (bool)",
    "function allowAllItems() view returns (bool)",
    "function enableMint() view returns (bool)",
    "function enableTargetRedeem() view returns (bool)",
  ]);

  const vault = new Contract(address, iface, provider);
  const [assetAddress, is1155, allowAllItems, enableMint, enableTargetRedeem] = await Promise.all([
    vault.assetAddress(),
    vault.is1155(),
    vault.allowAllItems(),
    vault.enableMint(),
    vault.enableTargetRedeem(),
  ]);

  return {
    assetAddress: assetAddress.toLowerCase(),
    is1155: Boolean(is1155),
    allowAllItems: Boolean(allowAllItems),
    enableMint: Boolean(enableMint),
    enableTargetRedeem: Boolean(enableTargetRedeem),
  };
};

export const getPoolPrice = async (
  vault: string,
  amount: number,
  side: "sell" | "buy",
  slippage: number,
  provider: Provider
): Promise<{
  feeBps: BigNumberish;
  price: BigNumberish;
}> => {
  const chainId = await provider.getNetwork().then((n) => n.chainId);

  const weth = Common.Addresses.WNative[chainId];
  const sushiRouter = new Contract(
    Addresses.SushiRouter[chainId],
    new Interface([
      "function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)",
      "function getAmountsIn(uint amountOut, address[] memory path) view returns (uint[] memory amounts)",
    ]),
    provider
  );

  const localAmount = parseEther(amount.toString());
  const fees = await getPoolFees(vault, provider);

  if (side === "buy") {
    const path = [weth, vault];
    const amounts = await sushiRouter.getAmountsIn(
      localAmount.add(localAmount.mul(fees.redeemFee).div(UNIT)),
      path
    );

    let price = amounts[0];
    if (slippage) {
      price = bn(price).add(bn(price).mul(slippage).div(10000));
    }

    return {
      feeBps: bn(fees.redeemFee).div("100000000000000").toString(),
      price: price.toString(),
    };
  } else {
    const path = [vault, weth];
    const amounts = await sushiRouter.getAmountsOut(
      localAmount.sub(localAmount.mul(fees.mintFee).div(UNIT)),
      path
    );

    let price = amounts[1];
    if (slippage) {
      price = bn(price!).sub(bn(price).mul(slippage).div(10000));
    }

    return {
      feeBps: bn(fees.mintFee).div("100000000000000").toString(),
      price: price.toString(),
    };
  }
};

export const getPoolPriceFrom0x = async (
  vault: string,
  amount: number,
  side: "sell" | "buy",
  slippage: number,
  provider: Provider,
  apiKey?: string
): Promise<{
  feeBps: BigNumberish;
  price: BigNumberish;
  swapCallData: string;
}> => {
  const chainId = await provider.getNetwork().then((n) => n.chainId);
  const weth = Common.Addresses.WNative[chainId];
  const localAmount = parseEther(amount.toString());
  const fees = await getPoolFees(vault, provider);

  if (side === "buy") {
    const params = {
      buyToken: vault,
      sellToken: weth,
      slippagePercentage: (slippage / 100000).toString(),
      buyAmount: localAmount.add(localAmount.mul(fees.redeemFee).div(UNIT)).toString(),
    };
    const { data } = await axios.get(`${ZEROEX_ENDPOINT}/swap/v1/quote`, {
      params,
      headers: {
        "0x-api-key": apiKey,
      },
    });

    // Useful reference:
    // https://github.com/NFTX-project/nftxjs/blob/aae44048d078626ac14b40d5cd1fde60323816b7/packages/trade/src/trade/buy/buy.ts#L143-L147

    let price = parseEther(data.guaranteedPrice).mul(params.buyAmount).div(UNIT);
    if (slippage) {
      price = bn(price).add(bn(price).mul(slippage).div(100000));
    }

    return {
      swapCallData: data.data,
      feeBps: bn(fees.redeemFee).div("100000000000000").toString(),
      price: price.toString(),
    };
  } else {
    const params = {
      buyToken: weth,
      sellToken: vault,
      slippagePercentage: (slippage / 100000).toString(),
      sellAmount: localAmount.sub(localAmount.mul(fees.mintFee).div(UNIT)).toString(),
    };
    const { data } = await axios.get(`${ZEROEX_ENDPOINT}/swap/v1/quote`, {
      params,
      headers: {
        "0x-api-key": apiKey,
      },
    });

    let price = parseEther(data.guaranteedPrice).mul(params.sellAmount);
    if (slippage) {
      price = bn(price).sub(bn(price).mul(slippage).div(100000));
    }

    return {
      swapCallData: data.data,
      feeBps: bn(fees.mintFee).div("100000000000000").toString(),
      price: price.toString(),
    };
  }
};

export const getPoolNFTs = async (vault: string, provider: Provider) => {
  const tokenIds: string[] = [];
  const iface = new Interface(["function allHoldings() view returns (uint256[] memory)"]);

  const factory = new Contract(vault, iface, provider);
  try {
    const holdingNFTs = await factory.allHoldings();
    holdingNFTs.forEach((c: BigNumber) => {
      tokenIds.push(c.toString());
    });
  } catch {
    // Skip errors
  }

  return tokenIds;
};

export const getPoolFees = async (address: string, provider: Provider) => {
  const iface = new Interface([
    "function vaultId() view returns (uint256)",
    `
      function vaultFees(uint256 vaultId)
        view
        returns (
            uint256 mintFee,
            uint256 randomRedeemFee,
            uint256 targetRedeemFee,
            uint256 randomSwapFee,
            uint256 targetSwapFee
        )
      `,
  ]);

  const vault = new Contract(address, iface, provider);
  const vaultId = await vault.vaultId();

  const result = await new Contract(
    Addresses.VaultFactory[await provider.getNetwork().then((n) => n.chainId)],
    iface,
    provider
  ).vaultFees(vaultId);

  return {
    mintFee: result.mintFee.toString(),
    redeemFee: result.targetRedeemFee.toString(),
  };
};
