import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { extractByTx } from "../../orderbook/mints/calldata/detector/thirdweb";
import { jest, describe, it, expect } from "@jest/globals";
import * as utils from "@/events-sync/utils";
import { config } from "@/config/index";

jest.setTimeout(1000 * 1000);

describe("Mints - ThirdWeb", () => {
  it("normal", async () => {
    if (config.chainId != 534352) {
      return;
    }
    const transcation = await utils.fetchTransaction(
      "0xcecd1c1966d4182adf1033b83e46da5e9207f54e3e5a85cb8bb5aa09d1bd5ed6"
    );
    // Mint.dot fun
    // parsed:
    // mint(auth = {"key":"0x0000000000000000000000000000000000000000000000000000000000000000","proof":[]}, _count = 1)
    const infos = await extractByTx("0xd7a7bf902b101e108a08af2efae00fd415e5526b", transcation);
    // console.log("infos", infos);

    expect(infos.length).not.toBe(0);
  });
});
