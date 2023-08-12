import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { extractByCollection } from "../../orderbook/mints/calldata/detector/zora";
import { jest, describe, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("Mints - Zora", () => {
  it("erc1155-public-sale", async () => {
    const collection = `0xafd7b9edc5827f7e39dcd425d8de8d4e1cb292c1`;
    const infos = await extractByCollection(collection);
    expect(infos.length).not.toBe(0);
  });
});
