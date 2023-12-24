import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { extractByCollection } from "../../orderbook/mints/calldata/detector/createdotfun";
import { jest, describe, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("Mints - Create.fun", () => {
  it("create", async () => {
    const collection = `0x3578234c0fd2d531e84eec84cabf64ff5b246c30`;
    const infos = await extractByCollection(
      collection,
      "0x000000000f30984DE6843bBC1d109c95EA6242ac"
    );
    expect(infos.length).not.toBe(0);
  });
});
