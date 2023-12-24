import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import {
  extractByCollectionERC1155,
  extractByCollectionERC721,
  extractByTx,
} from "../../orderbook/mints/calldata/detector/zora";
import { jest, describe, it, expect } from "@jest/globals";
import * as utils from "@/events-sync/utils";

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

  it("erc1155-sale-reward", async () => {
    const collection = `0x60d35A892110705a09a7385efF144575F8f5D4cE`;
    const infos = await extractByCollectionERC1155(collection, "1");
    expect(infos.length).not.toBe(0);
    expect(infos[0]?.details.tx.data.signature).toBe("0x9dbb844d");
  });

  it("erc1155-new-case", async () => {
    const collection = `0xbafd92d5e08ddcbf238e96c6c7fe60c53fbbd72f`;
    const transcation = await utils.fetchTransaction(
      "0x0675019757d038516fc479db53d1311719afe0b2df5bccd52eec99c8cbed03eb"
    );
    const infos = await extractByTx(collection, transcation);
    // console.log("infos", infos)
    expect(infos.length).not.toBe(0);
    expect(infos[0]?.details.tx.data.signature).toBe("0x9dbb844d");
  });
});
