import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { baseProvider } from "@/common/provider";
import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { Common, Nftx } from "@reservoir0x/sdk";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumber, BigNumberish } from "ethers";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { parseTranscation } from "../utils/events";
import { expect, jest, test, describe } from "@jest/globals";

export const DEFAULT_SLIPPAGE = 1;

function addSlippage(price: BigNumber, percent: number) {
  return price.add(price.mul(percent).div(bn(100)));
}

function subSlippage(price: BigNumber, percent: number) {
  return price.sub(price.mul(percent).div(bn(100)));
}

export async function getPoolPrice(
  vault: string,
  amount = 1,
  slippage = DEFAULT_SLIPPAGE,
  chainId: number,
  provider: Provider
) {
  let buyPrice: BigNumberish | null = null;
  let sellPrice: BigNumberish | null = null;
  let randomBuyPrice: BigNumberish | null = null;

  let buyPriceRaw: BigNumberish | null = null;
  let sellPriceRaw: BigNumberish | null = null;
  let randomBuyPriceRaw: BigNumberish | null = null;

  const iface = new Interface([
    "function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)",
    "function getAmountsIn(uint amountOut, address[] memory path) view returns (uint[] memory amounts)",
  ]);

  const WETH = Common.Addresses.WNative[chainId];
  const SUSHI_ROUTER = Nftx.Addresses.SushiRouter[chainId];

  const sushiRouter = new Contract(SUSHI_ROUTER, iface, provider);

  try {
    const path = [WETH, vault];
    const amounts = await sushiRouter.getAmountsIn(parseEther(`${amount}`), path);
    buyPrice = amounts[0];
  } catch (error) {
    //
  }

  try {
    const path = [vault, WETH];
    const amounts = await sushiRouter.getAmountsOut(parseEther(`${amount}`), path);
    sellPrice = amounts[1];
  } catch (error) {
    //
  }

  const fees = await getPoolFees(vault, provider);
  const base = parseEther(`1`);

  let feeBpsSell = null;
  let feeBpsBuy = null;
  let feeBpsRandomBuy = null;

  if (sellPrice) {
    const price = bn(sellPrice).div(bn(amount));
    const mintFeeInETH = bn(fees.mintFee).mul(price).div(base);
    sellPriceRaw = price.sub(mintFeeInETH);
    sellPrice = subSlippage(sellPriceRaw, slippage);
    feeBpsSell = mintFeeInETH.mul(bn(10000)).div(sellPriceRaw).toString();
  }

  if (buyPrice) {
    // 1 ETH = x Vault Token
    const price = bn(buyPrice).div(bn(amount));
    const targetBuyFeeInETH = bn(fees.targetRedeemFee).mul(price).div(base);
    const randomBuyFeeInETH = bn(fees.randomRedeemFee).mul(price).div(base);

    buyPriceRaw = price.add(targetBuyFeeInETH);
    randomBuyPriceRaw = price.add(randomBuyFeeInETH);

    buyPrice = addSlippage(buyPriceRaw, slippage);
    randomBuyPrice = addSlippage(randomBuyPriceRaw, slippage);

    feeBpsBuy = targetBuyFeeInETH.mul(bn(10000)).div(buyPriceRaw).toString();

    feeBpsRandomBuy = randomBuyFeeInETH.mul(bn(10000)).div(randomBuyPriceRaw).toString();
  }

  return {
    fees,
    amount,
    bps: {
      sell: feeBpsSell,
      buy: feeBpsBuy,
      randomBuy: feeBpsRandomBuy,
    },
    slippage,
    raw: {
      sell: sellPriceRaw?.toString(),
      buy: buyPriceRaw?.toString(),
      buyRandom: randomBuyPriceRaw?.toString(),
    },
    currency: WETH,
    sell: sellPrice?.toString(),
    buy: buyPrice?.toString(),
    buyRandom: randomBuyPrice?.toString(),
  };
}

export async function getPoolNFTs(vault: string, provider: Provider) {
  const tokenIds: string[] = [];
  const iface = new Interface(["function allHoldings() external view returns (uint256[] memory)"]);

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
}

export async function getPoolFees(address: string, provider: Provider) {
  const iface = new Interface([
    "function mintFee() public view returns (uint256)",
    "function targetRedeemFee() public view returns (uint256)",
    "function randomRedeemFee() public view returns (uint256)",
  ]);

  const vault = new Contract(address, iface, provider);

  const [mintFee, targetRedeemFee, randomRedeemFee] = await Promise.all([
    vault.mintFee(),
    vault.targetRedeemFee(),
    vault.randomRedeemFee(),
  ]);

  return {
    mintFee: mintFee.toString(),
    randomRedeemFee: randomRedeemFee.toString(),
    targetRedeemFee: targetRedeemFee.toString(),
  };
}

jest.setTimeout(1000 * 1000);

describe("NFTX", () => {
  test("has-orders", async () => {
    // const tx = await baseProvider.getTransactionReceipt(
    //   "0xab53ee4ea3653b0956fd8a6dd4a01b20775f65fcc7badc3b6e20481316f6b1f0"
    // );
    // const events = await getEventsFromTx(tx);
    // const result = await handleEvents(events);
    // const order = result?.orders?.find((c) => c.kind === "nftx");
    // expect(order).not.toBe(null);
  });

  test("get-pooprice", async () => {
    const info = await getPoolPrice(
      "0x7269c9aaa5ed95f0cc9dc15ff19a4596308c889c",
      1,
      DEFAULT_SLIPPAGE,
      config.chainId,
      baseProvider
    );
    if (info?.raw?.buy) {
      expect(parseFloat(info.raw.buy)).toBeGreaterThan(parseFloat("0.4"));
    }
  });

  test("order-saving", async () => {
    // const tx = await baseProvider.getTransactionReceipt(
    //   "0x92322cb1a279df41e3efe9a3dd605cfe8f1f056519a1f1315d5b4e442ba16880"
    // );
    // const events = await getEventsFromTx(tx);
    // const result = await handleEvents(events);
    // const order = result?.orders?.find((c) => c.kind === "nftx");
    // expect(order).not.toBe(null);
    // const orderInfo: orders.nftx.OrderInfo = order?.info as orders.nftx.OrderInfo;
    // // Store order to database
    // await orders.nftx.save([orderInfo]);
  });

  test("event-parsing", async () => {
    const testCases = [
      // {
      //   name: "gem-router",
      //   tx: "0x92322cb1a279df41e3efe9a3dd605cfe8f1f056519a1f1315d5b4e442ba16880",
      // },
      // {
      //   name: "buyAndRedeem-multiple",
      //   tx: "0x49b39c167d61b1161cdf64c9e91eef14ecf538b383094089a547a2b71aa1720a",
      // },
      // {
      //   name: "buyAndSwap721-multiple",
      //   tx: "0x7139a5df97188bd4b1d039deb4c0e04d0bd74df9cc062e27993f28188f7d2367",
      // },
      // {
      //   name: "mintAndSell721WETH-multiple",
      //   tx: "0x191eec69b891bf6f7a84d256b5fccfbc2aef44fc51fabba3456f45802f905ad2",
      // },
      // {
      //   name: "uniswapV3",
      //   tx: "0x4db108871adb4a692c6fb42e7dec2aaa8f0473a78f958ced34f604025e4a42e4",
      // },
    ];

    for (let index = 0; index < testCases.length; index++) {
      // const testCase = testCases[index];
      // const {
      //   events,
      //   allOnChainData
      // } = await parseTranscation(testCase.tx);
      // try {
      //   const result = await handleEvents(events);
      //   const order = result?.orders?.find((c) => c.kind === "nftx");
      //   expect(order).not.toBe(null);
      // } catch (err) {
      //   // Errors
      // }
    }
    process.exit(0);
  });

  test("uniswapv3-swap", async () => {
    const { events, allOnChainData } = await parseTranscation(
      "0x4db108871adb4a692c6fb42e7dec2aaa8f0473a78f958ced34f604025e4a42e4"
    );

    const swapV3Event = events.find((c) => c.subKind === "nftx-swap-v3");
    expect(swapV3Event).not.toBe(undefined);
    if (allOnChainData.length) {
      const order = allOnChainData[0].orders[0];
      expect(order).not.toBe(undefined);
    }
  });

  test("uniswapv3-price", async () => {
    const { events, allOnChainData } = await parseTranscation(
      "0xc70a4f018a0f28aba4c5a2ad33cf1ba100e94b146d5baf2846bfad0fb4816f6d"
    );

    const swapV3Event = events.find((c) => c.subKind === "nftx-swap-v3");
    expect(swapV3Event).not.toBe(undefined);
    if (allOnChainData.length) {
      const order = allOnChainData[0].orders[0];
      expect(order).not.toBe(undefined);
    }
  });
});
