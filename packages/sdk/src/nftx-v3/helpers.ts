import { Interface } from "@ethersproject/abi";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { ethers } from "ethers";
import axios from "axios";

import * as Addresses from "./addresses";
import * as Common from "../common";
import { bn, getCurrentTimestamp } from "../utils";

import QuoterV2ABI from "./abis/QuoterV2.json";

const NFTX_ENDPOINT = "https://api-v3.nftx.xyz";

export const REWARD_FEE_TIER = 3_000;

export const getPoolFeatures = async (address: string, provider: JsonRpcProvider) => {
  const iface = new Interface([
    "function assetAddress() view returns (address)",
    "function is1155() view returns (bool)",
    "function allowAllItems() view returns (bool)",
    "function enableMint() view returns (bool)",
    "function enableRedeem() view returns (bool)",
    "function enableSwap() view returns (bool)",
  ]);

  const vault = new Contract(address, iface, provider);
  const [assetAddress, is1155, allowAllItems, enableMint, enableRedeem, enableSwap] =
    await Promise.all([
      vault.assetAddress(),
      vault.is1155(),
      vault.allowAllItems(),
      vault.enableMint(),
      vault.enableRedeem(),
      vault.enableSwap(),
    ]);

  return {
    assetAddress: assetAddress.toLowerCase(),
    is1155: Boolean(is1155),
    allowAllItems: Boolean(allowAllItems),
    enableMint: Boolean(enableMint),
    enableRedeem: Boolean(enableRedeem),
    enableSwap: Boolean(enableSwap),
  };
};

export const getPoolPrice = async (
  vault: string,
  amount: number,
  side: "sell" | "buy",
  slippage: number,
  feeTier: number,
  provider: JsonRpcProvider,
  // for "buy" side
  tokenIds?: number[]
): Promise<{
  price: BigNumberish;
  executeCallData: string;
}> => {
  const chainId = await provider.getNetwork().then((n) => n.chainId);
  const weth = Common.Addresses.WNative[chainId];

  const localAmount = parseEther(amount.toString());
  const fees = await getPoolETHFees(vault, provider);

  const quoter = new Contract(Addresses.QuoterV2[chainId], QuoterV2ABI, provider);
  const nftxUniversalRouterIFace = new Interface([
    `function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable`,
  ]);

  if (side === "buy") {
    const vaultContract = new Contract(
      vault,
      new Interface([
        "function is1155() view returns (bool)",
        "function vaultId() external view returns (uint256)",
        "function vTokenToETH(uint256 vTokenAmount) external view returns (uint256)",
      ]),
      provider
    );
    const vaultFactory = new Contract(
      Addresses.VaultFactory[chainId],
      new Interface([
        `function getVTokenPremium721(
            uint256 vaultId,
            uint256 tokenId
        ) external view returns (uint256 premium, address depositor)`,
        `function getVTokenPremium1155(
            uint256 vaultId,
            uint256 tokenId,
            uint256 amount
        )
            external
            view
            returns (
                uint256 totalPremium,
                uint256[] memory premiums,
                address[] memory depositors
            )`,
      ]),
      provider
    );

    const [is1155, vaultId]: [boolean, BigNumberish] = await Promise.all([
      vaultContract.is1155(),
      vaultContract.vaultId(),
    ]);

    let premiums: BigNumberish[];
    if (is1155) {
      premiums = await Promise.all(
        tokenIds!.map(async (tokenId) => {
          const { premium }: { premium: BigNumberish } = await vaultFactory.getVTokenPremium1155(
            vaultId,
            tokenId,
            1
          );

          return premium;
        })
      );
    } else {
      premiums = await Promise.all(
        tokenIds!.map(async (tokenId) => {
          const { premium }: { premium: BigNumberish } = await vaultFactory.getVTokenPremium721(
            vaultId,
            tokenId
          );

          return premium;
        })
      );
    }
    const premiumsInETH: BigNumberish[] = await Promise.all(
      premiums.map(async (premium) => {
        const premInEth = await vaultContract.vTokenToETH(premium);
        return premInEth;
      })
    );

    const netPremiumInETH = bn(premiumsInETH.reduce((acc, curr) => bn(acc).add(curr), bn(0)));

    const { amountIn: wethRequired }: { amountIn: BigNumberish } =
      await quoter.callStatic.quoteExactOutputSingle({
        tokenIn: weth,
        tokenOut: vault,
        amount: localAmount,
        fee: feeTier,
        sqrtPriceLimitX96: 0,
      });

    let price = bn(fees.redeemFee).mul(amount).add(netPremiumInETH).add(wethRequired);
    if (slippage) {
      price = price.add(price.mul(slippage).div(10000));
    }

    const executeCallData = nftxUniversalRouterIFace.encodeFunctionData("execute", [
      "0x01", // V3_SWAP_EXACT_OUT
      [
        ethers.utils.AbiCoder.prototype.encode(
          ["address", "uint256", "uint256", "bytes", "bool"],
          [
            // recipient
            Addresses.MarketplaceZap[chainId],
            // amountOut
            localAmount,
            // amountInMax
            slippage
              ? bn(wethRequired).add(bn(wethRequired).mul(slippage).div(10000))
              : wethRequired,
            // path
            ethers.utils.solidityPack(["address", "uint24", "address"], [vault, feeTier, weth]),
            true, // payerIsUser
          ]
        ),
      ],
      getCurrentTimestamp() * 10,
    ]);

    return { price, executeCallData };
  } else {
    const { amountOut: wethAmount }: { amountOut: BigNumberish } =
      await quoter.callStatic.quoteExactInputSingle({
        tokenIn: vault,
        tokenOut: weth,
        amountIn: localAmount,
        fee: feeTier,
        sqrtPriceLimitX96: 0,
      });
    let price = bn(wethAmount).sub(bn(fees.mintFee));
    if (slippage) {
      price = price.sub(price.mul(slippage).div(10000));
    }

    const executeCallData = nftxUniversalRouterIFace.encodeFunctionData("execute", [
      "0x00", // V3_SWAP_EXACT_IN
      [
        ethers.utils.AbiCoder.prototype.encode(
          ["address", "uint256", "uint256", "bytes", "bool"],
          [
            // recipient
            Addresses.MarketplaceZap[chainId],
            // amountIn
            localAmount,
            // amountOutMin
            slippage ? bn(wethAmount).sub(bn(wethAmount).mul(slippage).div(10000)) : wethAmount,
            // path
            ethers.utils.solidityPack(["address", "uint24", "address"], [vault, feeTier, weth]),
            true, // payerIsUser
          ]
        ),
      ],
      getCurrentTimestamp() * 10,
    ]);

    return { price, executeCallData };
  }
};

export const getPoolPriceFromAPI = async ({
  tokenIds,
  amount,
  ...args
}: {
  vault: string;
  side: "sell" | "buy";
  slippage: number;
  provider: JsonRpcProvider;
  amount?: number;
  tokenIds?: string[];
  amounts?: string[];
  nftxApiKey: string;
}) => {
  if (!tokenIds) {
    if (!amount) {
      amount = 1;
    }
    tokenIds = new Array(amount).fill(null).map((_, i) => `-99999${i}}`);
  }

  return getPoolPriceOrQuoteFromAPI({ ...args, tokenIds, type: "price" });
};

export const getPoolQuoteFromAPI = async (args: {
  vault: string;
  side: "sell" | "buy";
  slippage: number;
  provider: JsonRpcProvider;
  tokenIds: string[];
  userAddress: string;
  amounts?: string[];
  nftxApiKey: string;
}) => {
  return getPoolPriceOrQuoteFromAPI({ ...args, type: "quote" });
};

const getPoolPriceOrQuoteFromAPI = async ({
  type,
  provider,
  side,
  slippage,
  tokenIds,
  userAddress,
  vault,
  amounts,
  nftxApiKey,
}: {
  type: "quote" | "price";
  vault: string;
  side: "sell" | "buy";
  slippage: number;
  provider: JsonRpcProvider;
  tokenIds: string[];
  userAddress?: string;
  amounts?: string[];
  nftxApiKey: string;
}): Promise<{
  price: BigNumber;
  vTokenPrice: BigNumber;
  premiumPrice: BigNumber;
  feePrice: BigNumber;
  executeCallData: string;
}> => {
  const chainId = await provider.getNetwork().then((n) => n.chainId);
  const vaultContract = new Contract(
    vault,
    new Interface([
      "function is1155() view returns (bool)",
      "function vaultId() external view returns (uint256)",
    ]),
    provider
  );

  const [is1155, vaultId]: [boolean, BigNumberish] = await Promise.all([
    vaultContract.is1155(),
    vaultContract.vaultId(),
  ]);

  let apiResponse: {
    data: {
      price: string;
      vTokenPrice: string;
      premiumPrice: string;
      feePrice: string;
      methodParameters: {
        executeCalldata: string;
      };
    };
  };

  if (side === "buy") {
    const queryParams: string[][] = [];

    for (const tokenId of tokenIds) {
      queryParams.push(["buyTokenIds", tokenId]);
    }
    if (is1155 && amounts) {
      for (const amount of amounts) {
        queryParams.push(["buyAmounts", amount]);
      }
    }

    queryParams.push(["vaultId", vaultId.toString()]);
    if (userAddress) {
      queryParams.push(["userAddress", userAddress]);
    }

    if (slippage) {
      queryParams.push(["slippageTolerance", `${slippage}`]);
    }

    queryParams.push(["type", side]);

    const query = queryParams.map((param) => param.join("=")).join("&");

    const url = `${NFTX_ENDPOINT}/${chainId}/${type}?${query}`;

    apiResponse = await axios.get(url, {
      headers: {
        Authorization: nftxApiKey,
      },
    });
  } else {
    const queryParams: string[][] = [];

    for (const tokenId of tokenIds) {
      queryParams.push(["sellTokenIds", tokenId]);
    }
    if (is1155 && amounts) {
      for (const amount of amounts) {
        queryParams.push(["sellAmounts", amount]);
      }
    }

    queryParams.push(["type", side]);
    queryParams.push(["vaultId", vaultId.toString()]);
    if (userAddress) {
      queryParams.push(["userAddress", userAddress]);
    }
    if (slippage) {
      queryParams.push(["slippageTolerance", `${slippage}`]);
    }

    const query = queryParams.map((param) => param.join("=")).join("&");
    const url = `${NFTX_ENDPOINT}/${chainId}/${type}?${query}`;

    apiResponse = await axios.get(url, {
      headers: {
        Authorization: nftxApiKey,
      },
    });
  }

  return {
    price: bn(apiResponse.data.price),
    vTokenPrice: bn(apiResponse.data.vTokenPrice),
    premiumPrice: bn(apiResponse.data.premiumPrice),
    feePrice: bn(apiResponse.data.feePrice),
    executeCallData: apiResponse.data.methodParameters?.executeCalldata,
  };
};

export const getPoolNFTs = async (vault: string, provider: JsonRpcProvider) => {
  const tokenIds: string[] = [];
  const iface = new Interface(["function allHoldings() view returns (uint256[] memory)"]);

  const vaultContract = new Contract(vault, iface, provider);
  try {
    const holdingNFTs = await vaultContract.allHoldings();
    holdingNFTs.forEach((c: BigNumber) => {
      tokenIds.push(c.toString());
    });
  } catch {
    // Skip errors
  }

  return tokenIds;
};

export const getPoolETHFees = async (address: string, provider: JsonRpcProvider) => {
  const iface = new Interface([
    `
      function vaultFees()
        external
        view
        returns (
            uint256 mintFee,
            uint256 redeemFee,
            uint256 swapFee
        )
      `,
    "function vTokenToETH(uint256 vTokenAmount) external view returns (uint256)",
  ]);

  const vault = new Contract(address, iface, provider);
  const result = await vault.vaultFees();

  const mintFee = (await vault.vTokenToETH(result.mintFee)) as BigNumber;
  const redeemFee = (await vault.vTokenToETH(result.redeemFee)) as BigNumber;

  return {
    mintFee: mintFee.toString(),
    redeemFee: redeemFee.toString(),
  };
};
