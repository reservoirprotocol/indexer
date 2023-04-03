import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { checkMarketplaceIsFiltered } from "../../utils/marketplace-blacklists";
import { jest, describe, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("Marketplace - Blacklist", () => {
  it("get-list", async () => {
    const collection = `0x4c33397611F0974eAd4e0072221933bECdE79436`;
    const isBlocked = await checkMarketplaceIsFiltered(collection, "looks-rare");
    expect(isBlocked).toBe(true);
  });
});
