import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import * as Decent from "../../orderbook/mints/calldata/detector/decent";
import { jest, describe, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("Mints - Decent", () => {
  // Polygon
  it("public-sale", async () => {
    const collection = `0xDfB70c955F0bF2551F140Cb2413EAcf87d3fA5F9`;
    const info = await Decent.extractByCollection(collection);
    expect(info.length).not.toBe(0);
  });

  it("pre-sale", async () => {
    const collection = "0x59007965AcfE8817616DcC6c8b7B66f8F6eee1D6";
    const infos = await Decent.extractByCollection(collection);
    expect(infos.find((c) => c.stage === "presale")).not.toBe(undefined);
  });

  it("version-8-pre-sale", async () => {
    const collection = "0x2e1c696044a2d1343596480bee7f390637950350";
    const infos = await Decent.extractByCollection(collection);
    expect(infos.length).not.toBe(0);
  });
});
