import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import * as Foundation from "../../orderbook/mints/calldata/detector/foundation";
import { jest, describe, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("Mints - Foundation", () => {
  it("public-sale", async () => {
    const collection = `0x5959cddbe6b96afb19014fd77735a784f3e99a5f`;
    const info = await Foundation.extractByCollection(collection);
    expect(info.length).not.toBe(0);
  });
});
