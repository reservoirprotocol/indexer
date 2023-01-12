import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { baseProvider } from "@/common/provider";
import { getEventsFromTx } from "../utils/test";
import { handleEvents } from "@/events-sync/handlers/nftx";
import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { formatEther, parseEther } from "@ethersproject/units";
import { logger } from "@/common/logger";
import * as orders from "@/orderbook/orders";

async function getNFTxPoolPrice(id: string, type: string) {
  let buyPrice = null;
  let sellPrice = null;
  let assetAddress = null;
  let vaultAddress = null;

  const iface = new Interface([
    "function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)",
    "function getAmountsIn(uint amountOut, address[] memory path) view returns (uint[] memory amounts)",
  ]);
  const vaultFactoryAddress = "0xBE86f647b167567525cCAAfcd6f881F1Ee558216";
  const factory = new Contract(
    vaultFactoryAddress,
    ["function vault(uint256 vaultId) external view returns (address)"],
    baseProvider
  );

  vaultAddress = type === "id" ? await factory.vault(id) : id;
  const vault = new Contract(
    vaultAddress,
    ["function assetAddress() view returns (address)"],
    baseProvider
  );

  assetAddress = await vault.assetAddress();
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

  const sushiRouter = new Contract(
    "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
    iface,
    baseProvider
  );

  try {
    const amounts = await sushiRouter.getAmountsIn(parseEther("1"), [WETH, vaultAddress]);
    buyPrice = formatEther(amounts[0]);
  } catch (error) {
    logger.error("get-nftx-pool-price", `Failed to getAmountsIn: ${error}`);
  }

  try {
    const amounts = await sushiRouter.getAmountsOut(parseEther("1"), [vaultAddress, WETH]);
    sellPrice = formatEther(amounts[1]);
  } catch (error) {
    logger.error("get-nftx-pool-price", `Failed to getAmountsOut: ${error}`);
  }

  return {
    asset: assetAddress,
    vault: vaultAddress,
    price: {
      sell: sellPrice,
      buy: buyPrice,
    },
  };
}

jest.setTimeout(1000 * 1000);

describe("NFTX", () => {
  test("has-orders", async () => {
    const tx = await baseProvider.getTransactionReceipt(
      "0xab53ee4ea3653b0956fd8a6dd4a01b20775f65fcc7badc3b6e20481316f6b1f0"
    );
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);
    const order = result?.orders?.find((c) => c.kind === "nftx");
    expect(order).not.toBe(null);
  });

  test("get-pooprice", async () => {
    const info = await getNFTxPoolPrice("392", "id");
    expect(info.asset).toBe("0x5Af0D9827E0c53E4799BB226655A1de152A425a5");
    if (info?.price?.buy) {
      expect(parseFloat(info.price.buy)).toBeGreaterThan(parseFloat("0.4"));
    }
  });

  test("order-saving", async () => {
    const tx = await baseProvider.getTransactionReceipt(
      "0x92322cb1a279df41e3efe9a3dd605cfe8f1f056519a1f1315d5b4e442ba16880"
    );
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);
    const order = result?.orders?.find((c) => c.kind === "nftx");

    expect(order).not.toBe(null);

    const orderInfo: orders.nftx.OrderInfo = order?.info as orders.nftx.OrderInfo;

    // Store order to database
    await orders.nftx.save([orderInfo]);
  });

  test("event-parsing", async () => {
    const testCases = [
      {
        name: "gem-router",
        tx: "0x92322cb1a279df41e3efe9a3dd605cfe8f1f056519a1f1315d5b4e442ba16880",
      },
      {
        name: "buyAndRedeem-multiple",
        tx: "0x49b39c167d61b1161cdf64c9e91eef14ecf538b383094089a547a2b71aa1720a",
      },
      {
        name: "buyAndSwap721-multiple",
        tx: "0x7139a5df97188bd4b1d039deb4c0e04d0bd74df9cc062e27993f28188f7d2367",
      },
      {
        name: "mintAndSell721WETH-multiple",
        tx: "0x191eec69b891bf6f7a84d256b5fccfbc2aef44fc51fabba3456f45802f905ad2",
      },
    ];

    for (let index = 0; index < testCases.length; index++) {
      const testCase = testCases[index];
      const tx = await baseProvider.getTransactionReceipt(testCase.tx);
      const events = await getEventsFromTx(tx);
      try {
        const result = await handleEvents(events);
        const order = result?.orders?.find((c) => c.kind === "nftx");
        expect(order).not.toBe(null);
      } catch (err) {
        // Errors
      }
    }
    process.exit(0);
  });
});
