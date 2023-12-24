import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { extractByCollection } from "../../orderbook/mints/calldata/detector/mintdotfun";
import { jest, describe, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("Mints - Mint.fun", () => {
  it("parse", async () => {
    const collection = `0x0000000000664ceffed39244a8312bD895470803`;
    const infos = await extractByCollection(collection);
    expect(infos.length).not.toBe(0);
  });
});
