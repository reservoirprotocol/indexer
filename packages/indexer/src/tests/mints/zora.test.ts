import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import {
  extractByCollectionERC1155,
  extractByCollectionERC721,
} from "../../orderbook/mints/calldata/detector/zora";
import { jest, describe, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("Mints - Zora", () => {
  it("erc1155-public-sale", async () => {
    const collection = `0xafd7b9edc5827f7e39dcd425d8de8d4e1cb292c1`;
    const infos = await extractByCollectionERC1155(collection, "0");
    expect(infos.length).not.toBe(0);
  });

  it("erc721-sale-reward", async () => {
    // goerli
    const collection = `0x6C5D3A872d3B38C1b0fF1fde12Bf2f34297AddCe`;
    const infos = await extractByCollectionERC721(collection);
    expect(infos.length).not.toBe(0);
  });
});
