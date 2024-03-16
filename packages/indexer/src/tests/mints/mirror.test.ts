import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { jest, describe, it, expect } from "@jest/globals";
import * as utils from "@/events-sync/utils";
import { extractByTx } from "../../orderbook/mints/calldata/detector/mirror";
import { simulateCollectionMint } from "@/orderbook/mints/simulation";

jest.setTimeout(1000 * 1000);

describe("Mints - Mirror", () => {
  it("basic", async () => {
    // Base
    const transcation = await utils.fetchTransaction(
      "0x937c0f80587434103e37b038ad7a418e14ce1e9a04c0640a894f2b8c6e4dbbb3"
    );
    const collectionMints = await extractByTx(
      "0x6e995b36db05ae66e926e5a50bfa17f36760f484",
      transcation
    );
    expect(collectionMints[0].stage.includes("public-")).not.toBe(false);
    for (const collectionMint of collectionMints) {
      const result = await simulateCollectionMint(collectionMint);
      expect(result).toBe(true);
    }
  });
});
