import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";

import * as Common from "../common";
import { bn } from "../utils";
import * as Addresses from "./addresses";

export const getPoolFeatures = async (address: string, provider: Provider) => {
  const iface = new Interface([
    "function assetAddress() view returns (address)",
    "function is1155() view returns (bool)",
    "function allowAllItems() view returns (bool)",
    "function enableMint() view returns (bool)",
    "function enableTargetRedeem() view returns (bool)",
  ]);

  const vault = new Contract(address, iface, provider);
  const [assetAddress, is1155, allowAllItems, enableMint, enableTargetRedeem] =
    await Promise.all([
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

  const weth = Common.Addresses.Weth[chainId];
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
  const unit = parseEther("1");

  if (side === "buy") {
    const path = [weth, vault];
    const amounts = await sushiRouter.getAmountsIn(
      localAmount.add(localAmount.mul(fees.redeemFee).div(unit)),
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
      localAmount.sub(localAmount.mul(fees.mintFee).div(unit)),
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

export const getPoolNFTs = async (vault: string, provider: Provider) => {
  const tokenIds: string[] = [];
  const iface = new Interface([
    "function allHoldings() view returns (uint256[] memory)",
  ]);

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
    "function mintFee() view returns (uint256)",
    "function targetRedeemFee() view returns (uint256)",
  ]);

  const vault = new Contract(address, iface, provider);
  const [mintFee, redeemFee] = await Promise.all([
    vault.mintFee(),
    vault.targetRedeemFee(),
  ]);

  return {
    mintFee: mintFee.toString(),
    redeemFee: redeemFee.toString(),
  };
};
