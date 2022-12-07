import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { baseProvider } from "@/common/provider";
import { getEventsFromTx, wait } from "../utils/test";
import { handleEvents } from "@/events-sync/handlers/blur";
import { Blur } from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { OrderInfo } from "@/orderbook/orders/blur";
import { processOnChainData } from "@/events-sync/handlers/utils";
import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { getOrder } from "tests/utils/order";

async function saveContract(address: string, kind: string) {
  const columns = new pgp.helpers.ColumnSet(["address", "kind"], {
    table: "contracts",
  });
  const queries = [
    `
  INSERT INTO "contracts" (
    "address",
    "kind"
  ) VALUES ${pgp.helpers.values(
    {
      address: toBuffer(address),
      kind,
    },
    columns
  )}
  ON CONFLICT DO NOTHING
`,
  ];
  await idb.none(pgp.helpers.concat(queries));
}

jest.setTimeout(1000 * 1000);

type FillItem = {
  contract: string;
  tokenId: string;
  orderSide: string;
  taker: string;
  maker: string;
  currency: string;
};

type TestCase = {
  name: string;
  tx: string;
  fills: FillItem[];
};

describe("Blur", () => {
  const chainId = config.chainId;

  test("order-saving", async () => {
    if (chainId == 1) {
      return;
    }
    const rawData = `0x9a1fc3a70000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000038000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000001bacee62d7acadd0ae2b3a3a5a674f97671659ce51c9c292ac4a4c2193b3a0891042c94a13168ff144eb30131161d8b0aabb588296d5db1713ce58fd480d3bf09700000000000000000000000000000000000000000000000000000000000002c000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000f26fdf000000000000000000000000f65d928d8c143e49096cf666095a2be54bd431eb000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000006411739da1c40b106f8511de5d1fac00000000000000000000000005da517b1bf9999b7762eaefa8372341a1a475590000000000000000000000000000000000000000000000000000000000001668000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000917070797e18000000000000000000000000000000000000000000000000000000000006362a59800000000000000000000000000000000000000000000000000000000638a329800000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000053cae46abac64a5d1dc3a8ad0746b5c00000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001d89573ca21c1878c2b55da13ef170bbcd599defb26a6e277239b686e38bb1e1900000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f26fdf00000000000000000000000000fb2499403afeccd48f0fb29da41cde8c113d4b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006411739da1c40b106f8511de5d1fac00000000000000000000000005da517b1bf9999b7762eaefa8372341a1a475590000000000000000000000000000000000000000000000000000000000001668000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000917070797e180000000000000000000000000000000000000000000000000000000000063636fa90000000000000000000000000000000000000000000000000000000063638bc900000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000002d01851a2889aa9cb3ccd62f4322510e00000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000`;
    const exchange = new Blur.Exchange(config.chainId);
    const builder = new Blur.Builders.SingleToken(config.chainId);
    const inputData = exchange.contract.interface.decodeFunctionData("execute", rawData);

    const sellInput = inputData.sell;
    const sellOrder = sellInput.order;

    const order = builder.build({
      side: sellOrder.side === 1 ? "sell" : "buy",
      trader: sellOrder.trader,
      collection: sellOrder.collection,
      tokenId: sellOrder.tokenId.toString(),
      amount: sellOrder.amount.toString(),
      paymentToken: sellOrder.paymentToken,
      price: sellOrder.price.toString(),
      listingTime: sellOrder.listingTime.toString(),
      matchingPolicy: sellOrder.matchingPolicy,
      nonce: 0,
      expirationTime: sellOrder.expirationTime.toString(),
      fees: sellOrder.fees.map((_: { recipient: string; rate: number }) => {
        return {
          rate: _.rate,
          recipient: _.recipient,
        };
      }),
      salt: sellOrder.salt.toString(),
      extraParams: sellOrder.extraParams,
      r: sellInput.r,
      v: sellInput.v,
      s: sellInput.s,
      extraSignature: sellInput.extraSignature,
      signatureVersion: sellInput.signatureVersion,
      blockNumber: sellInput.blockNumber.toString(),
    });

    await saveContract(sellOrder.collection.toLowerCase(), "erc721");

    // Store orders
    const orders: OrderInfo[] = [];
    orders.push({
      orderParams: order.params,
      metadata: {},
    });

    await processOnChainData({
      orders: orders.map((info) => ({
        kind: "blur",
        info,
      })),
    });

    const orderInDb = await getOrder(
      "0x71ba349119ef6685a84da0ccd810ec3070345608fe981619f071ad268b499eba"
    );

    await wait(20 * 1000);
    expect(orderInDb).not.toBe(null);
  });

  test("cancelOrder", async () => {
    const tx = await baseProvider.getTransactionReceipt(
      "0x567d3d9cc5f4f642c9c4711d375b439f0efdf98033545a05d5bb161669a8f976"
    );
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);
    expect(result.cancelEventsOnChain?.length).toEqual(1);
  });

  test("testSell", async () => {
    if (chainId == 1) {
      return;
    }
    // testnet
    const tx = await baseProvider.getTransactionReceipt(
      "0x7d395ee0df1ed8c81a19d11ada7273a64fe41dee7cb899ecf8fd52a3d1db8240"
    );
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);
    expect(result.cancelEventsOnChain?.length).toEqual(1);
  });

  test("testBuy", async () => {
    if (chainId == 1) {
      return;
    }
    // testnet
    const tx = await baseProvider.getTransactionReceipt(
      "0x1c2e4477085dfc71402b8beab6ffe42423b877b773cb48c14c8b7c3d1f17b3dd"
    );
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);
    expect(result.cancelEventsOnChain?.length).toEqual(1);
  });

  const allTestCases: TestCase[] = [
    {
      name: "bid",
      tx: "0xae93dcfee4d67a26b684e2ef0e88553b3a0bcc4d43c77be3638e6c8f2a4b2695",
      fills: [
        {
          orderSide: "buy",
          contract: "0x9251dec8df720c2adf3b6f46d968107cbbadf4d4",
          tokenId: "3064",
          taker: "0x95cd652430c973b80cbaed8afb869bea4812bb4c",
          maker: "0xe9472fdffaa6792df8ff5faab5866c90dc7f6f22",
          currency: "0x0000000000a39bb272e79075ade125fd351887ac",
        },
      ],
    },
    {
      name: "single-sale",
      tx: "0x344f5ddfc0d4fd239303f6b67aeb18f57b6932edb123859c7a66548eb0ce5364",
      fills: [
        {
          orderSide: "sell",
          maker: "0xf16688ea2488c0d41a13572a7399e03069d49a1a",
          taker: "0x28cd0dfc42756f68b3e1f8883e517e64e474078a",
          tokenId: "1000101016",
          contract: "0xd8b7cc75e22031a72d7b8393113ef2536e17bde6",
          currency: "0x0000000000000000000000000000000000000000",
        },
      ],
    },
    {
      name: "single-router",
      tx: "0x9e4e8ba883e49c296c16f7c06b7f68244c5b916085afee05d24be6d2f02716ca",
      fills: [
        {
          orderSide: "sell",
          maker: "0xb235ba58e93ba482b19e81d66eb001cd6ffd601b",
          taker: "0xed2ab4948ba6a909a7751dec4f34f303eb8c7236",
          currency: "0x0000000000000000000000000000000000000000",
          contract: "0x05da517b1bf9999b7762eaefa8372341a1a47559",
          tokenId: "826",
        },
      ],
    },
    {
      name: "new-case",
      tx: "0x069701a3997899580be4e39ee9defcd007dc8a70f5218b7c86ba0ac7d9ca87a2",
      fills: [
        {
          orderSide: "sell",
          maker: "0xcce9863cfb538e367751eecfe8cff0632d7191c5",
          taker: "0x0d30ca8dc55d1b5ef9cba4fa504da8341e252cec",
          currency: "0x0000000000000000000000000000000000000000",
          contract: "0x3acce66cd37518a6d77d9ea3039e00b3a2955460",
          tokenId: "6444",
        },
      ],
    },
    {
      name: "sell-lower-listtime",
      tx: "0x35de25348f9a96579c3a08dc50dac3d4e98e4645b0c464883c4179293f5d040f",
      fills: [
        {
          contract: "0xdcf68c8ebb18df1419c7dff17ed33505faf8a20c",
          tokenId: "1591",
          orderSide: "sell",
          taker: "0x27ccf1f86c324fbc4810c95878c772d40b2fa3e5",
          maker: "0xe267f356949c80ab2d98ac444d12e0018324f97e",
          currency: "0x0000000000000000000000000000000000000000",
        },
      ],
    },
    {
      name: "multiple-sales-router",
      tx: "0x0abdd7ceddcb1f54c82a89e0d026fbd160c36ebfe155421443097d3c5cdc9bb2",
      fills: [
        {
          contract: "0xcbc67ea382f8a006d46eeeb7255876beb7d7f14d",
          tokenId: "1578",
          orderSide: "sell",
          taker: "0x762172c3c9030e13fdaca2ee0de5b0d152ee604e",
          maker: "0x88da8e5677dee90ffa14b307b2b16bce1a74c21d",
          currency: "0x0000000000000000000000000000000000000000",
        },
        {
          contract: "0xcbc67ea382f8a006d46eeeb7255876beb7d7f14d",
          tokenId: "3537",
          orderSide: "sell",
          taker: "0x762172c3c9030e13fdaca2ee0de5b0d152ee604e",
          maker: "0xb99f2a6c6576a1e1b1cc6c787e3eff30d9fd9d44",
          currency: "0x0000000000000000000000000000000000000000",
        },
      ],
    },
    {
      name: "missing-sales",
      tx: "0x135291243e196123e4526788c871e66fc6325c729b3bbe7eaf7c8488f8dd94d7",
      fills: [
        {
          contract: "0x40cf6a63c35b6886421988871f6b74cc86309940",
          tokenId: "1749",
          orderSide: "buy",
          taker: "0xb2e7f7cf519020c8b6ff32a088fec95b03ccc715",
          maker: "0x0ef4db30f76bcbd1ee7ddbb056e699b69dfb8eae",
          currency: "0x0000000000a39bb272e79075ade125fd351887ac",
        },
      ],
    },
  ];

  const testEventParing = async (testCase: TestCase) => {
    const tx = await baseProvider.getTransactionReceipt(testCase.tx);
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);
    for (const fill of testCase.fills) {
      const matchFillEvent = result.fillEvents?.find(
        (_) => _.tokenId === fill.tokenId && _.contract === fill.contract
      );
      expect(matchFillEvent).not.toBe(null);
      expect(matchFillEvent?.taker).toBe(fill.taker);
      expect(matchFillEvent?.maker).toBe(fill.maker);
      expect(matchFillEvent?.orderSide).toBe(fill.orderSide);
    }
  };

  for (const allTestCase of allTestCases) {
    test(`eventParsing - ${allTestCase.name}`, async () => testEventParing(allTestCase));
  }
});
