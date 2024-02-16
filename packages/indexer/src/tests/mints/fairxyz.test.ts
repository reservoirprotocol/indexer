import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { jest, describe, it, expect } from "@jest/globals";
import * as utils from "@/events-sync/utils";
import { extractByTx } from "../../orderbook/mints/calldata/detector/fairxyz";
import { simulateCollectionMint } from "@/orderbook/mints/simulation";

jest.setTimeout(1000 * 1000);

describe("Mints - Fair.xyz", () => {
  it("basic", async () => {
    const transcation = await utils.fetchTransaction(
      "0x3c55ae622f23285578eaabefe8a517a046ebeaabc1f3428cc77cefa76fce6e31"
    );
    const collectionMints = await extractByTx(
      "0x4e76b757df4f0bcc23aeab27a73890a3ed86fdd0",
      transcation
    );
    expect(collectionMints[0].stage.includes("claim-")).not.toBe(false);
    for (const collectionMint of collectionMints) {
      const result = await simulateCollectionMint(collectionMint);
      expect(result).toBe(true);
    }
  });
});
