import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import {
  extractByTx,
  extractByCollectionERC721,
} from "../../orderbook/mints/calldata/detector/manifold";
import { jest, describe, it, expect } from "@jest/globals";
import * as utils from "@/events-sync/utils";
import { simulateCollectionMint } from "@/orderbook/mints/simulation";

jest.setTimeout(1000 * 1000);

describe("Mints - Manifold", () => {
  it("version-3", async () => {
    const transcation = await utils.fetchTransaction(
      "0xfb5e2da32e68c9c5bcbbd8303f04c7396a320943cb2fdeaba8309226b08105f9"
    );
    const infos = await extractByTx("0x3e08b0d128e055b839c5c4f54880edc8498c1f91", transcation);
    expect(infos[0].stage.includes("claim-")).not.toBe(false);
  });

  it("with-event", async () => {
    const infos = await extractByCollectionERC721(
      "0x6b779e2BefA6ea178ebd98E42426284D38c8b10f",
      "73697520",
      {
        extension: "0x1eb73fee2090fb1c20105d5ba887e3c3ba14a17e",
      }
    );
    expect(infos[0].stage.includes("claim-")).not.toBe(false);
  });

  it("case-erc1155-1", async () => {
    const transcation = await utils.fetchTransaction(
      "0x435ff337737fe0c54d92bafb67b57693c7faf0094db5a25a928282ae66cc223e"
    );
    const collectionMints = await extractByTx(
      "0x4113e83adbb02aab32bf9885c0ea097637e81d96",
      transcation
    );
    for (const collectionMint of collectionMints) {
      if (collectionMint.status === "open") {
        const result = await simulateCollectionMint(collectionMint);
        expect(result).toBe(true);
      }
    }
    expect(collectionMints[0].stage.includes("claim-")).not.toBe(false);
  });

  it("case-erc1155-2", async () => {
    const transcation = await utils.fetchTransaction(
      "0xd4b6f4a4a79d74d0e1f7214865ad2a8f98a2ff6d80ebcb4e51c325fb86fd5f96"
    );
    const collectionMints = await extractByTx(
      "0x59fd8a189ff66c654628949044e774518fe22034",
      transcation
    );
    // console.log("collectionMints", collectionMints)
    for (const collectionMint of collectionMints) {
      if (collectionMint.status === "open") {
        const result = await simulateCollectionMint(collectionMint);
        expect(result).toBe(true);
      }
    }
    expect(collectionMints[0].stage.includes("claim-")).not.toBe(false);
  });

  it("case-erc1155-3", async () => {
    const transcation = await utils.fetchTransaction(
      "0x098588156053c10d4c299c91cd496d4799d4938f8f3441421f09603dcc657a35"
    );
    const collectionMints = await extractByTx(
      "0x85b7e3eb2e3fbafeccdea6b69dd350f6e1c9a8e8",
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

  it("case-erc721-1", async () => {
    const transcation = await utils.fetchTransaction(
      "0x09d7b966ff5cdfa6e7b31dd29217a81f9139eb802f59d646cb07ba53fa858838"
    );
    const collectionMints = await extractByTx(
      "0x992a3e23e4f53b4c02639913a3572f5b29b837b6",
      transcation
    );
    // console.log("collectionMints", collectionMints)
    for (const collectionMint of collectionMints) {
      if (collectionMint.status === "open") {
        const result = await simulateCollectionMint(collectionMint);
        expect(result).toBe(true);
      }
    }
    expect(collectionMints[0].stage.includes("claim-")).not.toBe(false);
  });

  it("case-erc1155-4", async () => {
    const transcation = await utils.fetchTransaction(
      "0xb85c23530fa911593265789bdee9eea0ba3428e9a3fe46d05e5e27a383deb07d"
    );
    const collectionMints = await extractByTx(
      "0xa4b9432c70c522951e8d40e1318e6ec41ae954f1",
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
