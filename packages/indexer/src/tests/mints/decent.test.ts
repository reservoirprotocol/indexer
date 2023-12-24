import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { describe, expect, it, jest } from "@jest/globals";
import { Network } from "@reservoir0x/sdk/dist/utils";

import { config } from "../../config";
import * as Decent from "../../orderbook/mints/calldata/detector/decent";

jest.setTimeout(60 * 1000);

if (config.chainId === Network.Polygon) {
  describe("Mints - Decent", () => {
    it("public-sale", async () => {
      const collection = "0xdfb70c955f0bf2551f140cb2413eacf87d3fa5f9";
      const info = await Decent.extractByCollectionERC721(collection);
      expect(info.length).not.toBe(0);
    });

    it("pre-sale", async () => {
      const collection = "0x59007965acfe8817616dcc6c8b7b66f8f6eee1d6";
      const infos = await Decent.extractByCollectionERC721(collection);
      expect(infos.find((c) => c.stage === "presale")).not.toBe(undefined);
    });

    it("version-8-pre-sale", async () => {
      const collection = "0x2e1c696044a2d1343596480bee7f390637950350";
      const infos = await Decent.extractByCollectionERC721(collection);
      expect(infos.length).not.toBe(0);
    });
  });
}
