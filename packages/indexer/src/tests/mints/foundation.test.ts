import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { describe, expect, it, jest } from "@jest/globals";
import { Network } from "@reservoir0x/sdk/dist/utils";

import { config } from "../../config";
import * as Foundation from "../../orderbook/mints/calldata/detector/foundation";

jest.setTimeout(60 * 1000);

if (config.chainId === Network.Ethereum) {
  describe("Mints - Foundation", () => {
    it("public-sale", async () => {
      const collection = "0x5959cddbe6b96afb19014fd77735a784f3e99a5f";
      const info = await Foundation.extractByCollectionERC721(collection);
      expect(info.length).not.toBe(0);
    });

    it("allowlist-sale", async () => {
      const collection = "0x738541f5ed9bc7ac8943df55709d5002693b43e3";
      const info = await Foundation.extractByCollectionERC721(collection);
      expect(info.length).not.toBe(0);
    });
  });
}
