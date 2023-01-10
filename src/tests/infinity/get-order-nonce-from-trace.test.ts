import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { config } from "@/config/index";
import { getOrderNonceFromTrace } from "@/events-sync/handlers/infinity";

describe("Infinity get order nonce from trace", () => {
  if (config.chainId !== 1) {
    throw new Error("Chain ID must be 1");
  }

  /**
   * this test is for a transaction on goerli - there are currently no matchOneToMany transaction on mainnet
   */
  //   test("matchOneToMany", async () => {
  //     const txHash = "0x129bdc7068357d4a5f5b8f9d583c2ecf60e6fe6ff0ae629c24ef0502d46db1f5";
  //     const block = 7186305;
  //     const orderHash = "0x052c45042c9faa8935b8a29b228b99950da7f9add6b032e01d5194b980dd07fb";
  //     const orderNonce = "311";
  //     const result = await getOrderNonceFromTrace(orderHash, matchOneToManyTrace);
  //     expect(result?.nonce).toBe(orderNonce);
  //   });

  test("matchOneToOne", async () => {
    const txHash = "0xf8b0ddb01e34dcee5cea00db2fc86d2e4fea5979049f74890df62cbd61950ca4";
    const block = 15138465;
    const orderHash = "0x58779b9babbafa932a32f0ab60bcc9bd041c786a3cb759795702cdd755fd048b";
    const orderNonce = "32";

    const result = await getOrderNonceFromTrace(orderHash, {
      txHash,
      block,
    });

    expect(result?.nonce).toBe(orderNonce);
  });

  test("matchOrders", async () => {
    const txHash = "0xb7f337648ac133ddc94f2da51e97b2f781ed7ab5a8afdac3b29db0ce11803ebe";
    const block = 15269609;
    const orderHash = "0x200e7124b225f25759558d6706cada40a9facaf86f81f8981f90188ff2e00722";
    const orderNonce = "2";

    const result = await getOrderNonceFromTrace(orderHash, {
      txHash,
      block,
    });

    expect(result?.nonce).toBe(orderNonce);
  });

  test("takeMultipleOneOrders", async () => {
    const txHash = "0x5c3f8d027d0eac339922bbffeac745b0ae80de3bc7e6380c78b5b00c5caa7ef2";
    const block = 15245317;
    const orderHash = "0x12f09725578c1639433d20ff7831111ebe7aed3ba4777a7645836a7196dc8459";
    const orderNonce = "54";

    const result = await getOrderNonceFromTrace(orderHash, {
      txHash,
      block,
    });

    expect(result?.nonce).toBe(orderNonce);
  });

  test("takeOrders", async () => {
    const txHash = "0x899f3a9976030aff6711425d8a6fd54a455b6be4fb6d55820c6a1758aadbc062";
    const block = 15231289;
    const orderHash = "0x798d4938ecf040df058d110df90c29eb90ff9134c4e0030e38a3ac69fc01b4dd";
    const orderNonce = "102";

    const result = await getOrderNonceFromTrace(orderHash, {
      txHash,
      block,
    });

    expect(result?.nonce).toBe(orderNonce);
  });
});
