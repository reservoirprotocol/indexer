import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { jest, describe, it, expect } from "@jest/globals";
import * as utils from "@/events-sync/utils";
import { extractByTx } from "../../orderbook/mints/calldata/detector/paragraph";
import { simulateCollectionMint } from "@/orderbook/mints/simulation";

jest.setTimeout(1000 * 1000);

describe("Mints - Paragraph", () => {
  it("basic", async () => {
    // Base
    const transcation = await utils.fetchTransaction(
      "0x350a341d6bb74a5e57f8642ba574960679c4bb69fd810f973fdc818dc5d3de5f"
    );
    const collectionMints = await extractByTx(
      "0xe3c6af285982a7aa79bec1a2c25fc121b984396a",
      transcation
    );

    expect(collectionMints[0].stage.includes("public-")).not.toBe(false);
    for (const collectionMint of collectionMints) {
      const result = await simulateCollectionMint(collectionMint);
      expect(result).toBe(true);
    }
  });
});
