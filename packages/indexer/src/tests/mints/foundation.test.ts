import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import * as Foundation from "../../orderbook/mints/calldata/detector/foundation";
import { jest, describe, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("Mints - Foundation", () => {
  it("public-sale", async () => {
    const collection = `0x5959cddbe6b96afb19014fd77735a784f3e99a5f`;
    const info = await Foundation.extractByCollectionERC721(collection);
    expect(info.length).not.toBe(0);
  });

  it("allowlist-sale", async () => {
    const collection = `0x738541f5ED9BC7ac8943DF55709D5002693B43e3`;
    const info = await Foundation.extractByCollectionERC721(collection);
    expect(info.length).not.toBe(0);
  });
});
