import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { jest, describe, it, expect } from "@jest/globals";
import * as utils from "@/events-sync/utils";
import { extractByTx } from "../../orderbook/mints/calldata/detector/nfts2me";
// import { simulateCollectionMint } from "@/orderbook/mints/simulation";
// import { generateCollectionMintTxData } from "@/orderbook/mints/calldata";

jest.setTimeout(1000 * 1000);

describe("Mints - Mirror", () => {
  it("v1", async () => {
    // Linea
    const transcation = await utils.fetchTransaction(
      "0xa00205e3a0a0ff229a899c8fdbc6d7632a37d8355d1b5acbca91714af9e9b34a"
    );
    const collectionMints = await extractByTx(
      "0xea9401caaa4533dc983ef7608e3c9ddd92d84fd5",
      transcation
    );
    // console.log('collectionMints', collectionMints)
    expect(collectionMints[0].stage.includes("public-")).not.toBe(false);
    // for (const collectionMint of collectionMints) {
    //      const data = await generateCollectionMintTxData(collectionMint, '0x0000000000000000000000000000000000000001', 1);
    //      console.log('data', data)
    //     const result = await simulateCollectionMint(collectionMint);
    //     expect(result).toBe(true);
    // }
  });

  it("v2", async () => {
    // Base
    const transcation = await utils.fetchTransaction(
      "0x7e5c5cdf8e42edfeaf5d2dadf690ddad6e18a3047265764aee69ae9ac1cfd195"
    );
    const collectionMints = await extractByTx(
      "0xeea0eac6c7ecb54f3ae7297bf41d2e0462e2afde",
      transcation
    );
    // console.log('collectionMints', collectionMints)
    expect(collectionMints[0].stage.includes("public-")).not.toBe(false);
    // for (const collectionMint of collectionMints) {
    //   const data = await generateCollectionMintTxData(
    //     collectionMint,
    //     "0x0000000000000000000000000000000000000001",
    //     1
    //   );
    //      console.log('data', data)
    //     const result = await simulateCollectionMint(collectionMint);
    //     expect(result).toBe(true);
    // }
  });
});
