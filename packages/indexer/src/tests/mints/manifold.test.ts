import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import {
  extractByTx,
  extractByCollectionERC721,
} from "../../orderbook/mints/calldata/detector/manifold";
import { jest, describe, it, expect } from "@jest/globals";
import * as utils from "@/events-sync/utils";

jest.setTimeout(1000 * 1000);

describe("Mints - Manifold", () => {
  it("version-3", async () => {
    const transcation = await utils.fetchTransaction(
      "0xfb5e2da32e68c9c5bcbbd8303f04c7396a320943cb2fdeaba8309226b08105f9"
    );
    const infos = await extractByTx("0x3e08b0d128e055b839c5c4f54880edc8498c1f91", transcation);
    expect(infos[0].stage.includes("claim-")).not.toBe(false);
  });

  it("with-event", async () => {
    const infos = await extractByCollectionERC721(
      "0x6b779e2BefA6ea178ebd98E42426284D38c8b10f",
      "73697520",
      "0x1eb73fee2090fb1c20105d5ba887e3c3ba14a17e"
    );
    expect(infos[0].stage.includes("claim-")).not.toBe(false);
  });
});
