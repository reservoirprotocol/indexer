import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { config } from "@/config/index";
import * as Sdk from "@reservoir0x/sdk";
import {
  checkMarketplaceIsFiltered,
  getMarketplaceBlacklist,
} from "../../utils/marketplace-blacklists";
import { jest, describe, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("Marketplace - Blacklist", () => {
  it("get-list", async () => {
    const collection = `0x4c33397611F0974eAd4e0072221933bECdE79436`;
    const isBlocked = await checkMarketplaceIsFiltered(
      collection,
      [
        Sdk.LooksRare.Addresses.TransferManagerErc721[config.chainId],
        Sdk.LooksRare.Addresses.TransferManagerErc1155[config.chainId],
      ],
      true
    );
    expect(isBlocked).toBe(true);
  });

  it("blur-registry", async () => {
    const operators = await getMarketplaceBlacklist("0x9dC5EE2D52d014f8b81D662FA8f4CA525F27cD6b");
    expect(operators.includes("0xb16c1342e617a5b6e4b631eb114483fdb289c0a4")).toBe(true);
  });

  it("custom-registry", async () => {
    const isBlocked = await checkMarketplaceIsFiltered(
      "0xe012baf811cf9c05c408e879c399960d1f305903",
      ["0x000000000060C4Ca14CfC4325359062ace33Fe3D"]
    );
    expect(isBlocked).toBe(true);
  });
});
