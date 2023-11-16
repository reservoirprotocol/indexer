import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { extractByTx } from "../../orderbook/mints/calldata/detector/soundxyz";
import { jest, describe, it, expect } from "@jest/globals";
import * as utils from "@/events-sync/utils";
import {
  getEnhancedEventsFromTx,
  extractOnChainData,
} from "@/events-sync/handlers/royalties/utils";
import { simulateCollectionMint } from "@/orderbook/mints/simulation";

jest.setTimeout(1000 * 1000);

describe("Mints - Sound.xyz", () => {
  it("RangeEditionMinterV2_1", async () => {
    const transcation = await utils.fetchTransaction(
      "0x52902fcbaf77a84aed8ef7f56d1d80618d143617a4126a4ae36569f63d483148"
    );
    const infos = await extractByTx("0x12321d021aeff7dd1a6c1a4c0f7a1c2d87df6b4e", transcation);
    expect(infos[0].stage.includes("claim-")).not.toBe(false);
  });

  it("MerkleDropMinterV2_1", async () => {
    const transcation = await utils.fetchTransaction(
      "0xc0e562d3f275f8673a8f1982bba307fa8e99cb9c6f0e605a88de8ec332ab471d"
    );
    const infos = await extractByTx("0xdf61950959e00bcdd77160d34e3b3f4c2c1f8d26", transcation);
    expect(infos[0].kind.includes("allowlist")).not.toBe(false);
  });

  it("handle-after-creation", async () => {
    const events = await getEnhancedEventsFromTx(
      `0x5c2b9937118744b79afa96744fcbe2133606b975af86d3b5b00ea111f25bd5c1`
    );
    const [onChainData] = await extractOnChainData(events, true);
    expect(events.find((c) => c.subKind === "soundxyz-range-edition-mint-created")).not.toBe(
      undefined
    );
    expect(events.find((c) => c.subKind === "soundxyz-merkle-drop-mint-created")).not.toBe(
      undefined
    );
    expect(onChainData.mints.length).toBe(2);
  });

  it("old-version", async () => {
    const transcation = await utils.fetchTransaction(
      "0x515e37a75788fbcaf833370f3a3558799dfd6c1ff2754cfa28487009443fc1df"
    );
    const collectionMints = await extractByTx(
      "0x2fd2a508eb9a79eec48bcb783390d1dd69dac4fb",
      transcation
    );
    // console.log("collectionMints", collectionMints);
    for (const collectionMint of collectionMints) {
      if (collectionMint.status === "open") {
        const result = await simulateCollectionMint(collectionMint);
        expect(result).toBe(true);
      }
    }
    expect(collectionMints[0].stage.includes("claim-")).not.toBe(false);
  });
});
