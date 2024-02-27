import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { updateSNDList, checkAddressIsBlockedByOFAC } from "../../utils/ofac";
import { jest, describe, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("OFAC", () => {
  it("get-sdn", async () => {
    const blacklist = await updateSNDList();
    expect(blacklist.length).not.toBe(0);
  });

  it("blocked-check", async () => {
    const blacklist = await updateSNDList();
    const isBanned = await checkAddressIsBlockedByOFAC(blacklist[0]);
    expect(isBanned).toBe(true);
  });
});
