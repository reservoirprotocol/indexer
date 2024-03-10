import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { jest, describe, it, expect } from "@jest/globals";
import * as utils from "@/events-sync/utils";
import { extractByTx } from "../../orderbook/mints/calldata/detector/fabric";
import { simulateCollectionMint } from "@/orderbook/mints/simulation";

jest.setTimeout(1000 * 1000);

describe("Mints - Fabric", () => {
  it("basic", async () => {
    // Base
    const transcation = await utils.fetchTransaction(
      "0xd8702784d6a30da899ab67a1983676701e0648b094a459e91200abdabffe2954"
    );
    const collectionMints = await extractByTx(
      "0x20206437420330f20a44bf02e2abac4e6fcc49da",
      transcation
    );
    expect(collectionMints[0].stage.includes("public-")).not.toBe(false);
    for (const collectionMint of collectionMints) {
      const result = await simulateCollectionMint(collectionMint);
      expect(result).toBe(true);
    }
  });
});
