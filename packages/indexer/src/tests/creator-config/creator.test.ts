import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import {
  getCreatorTokenConfig,
  updateCreatorTokenConfig,
  getCreatorConfigFromDB,
  checkMarketplaceIsFiltered,
} from "../../utils/creator-token";
import { jest, describe, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("Creator Token", () => {
  it("save-config", async () => {
    const collection = `0x583DF340f3144693c01120DC7F1bb5eab322e936`;
    const onchainConfig = await getCreatorTokenConfig(collection);
    await updateCreatorTokenConfig(collection);
    const dbConfig = await getCreatorConfigFromDB(collection);

    expect(onchainConfig.validator).toBe(dbConfig.validator);
    expect(onchainConfig.transferSecurityLevel).toBe(dbConfig.transferSecurityLevel);
    expect(onchainConfig.permittedContractReceiversId).toBe(dbConfig.permittedContractReceiversId);
    expect(onchainConfig.operatorWhitelistId).toBe(dbConfig.operatorWhitelistId);
    expect(onchainConfig.receivers.length).toBe(dbConfig.receivers.length);
    expect(onchainConfig.operators.length).toBe(dbConfig.operators.length);
  });

  it("transfer-policy", async () => {
    // Level-Four
    const collection = `0x583DF340f3144693c01120DC7F1bb5eab322e936`;
    await updateCreatorTokenConfig(collection);
    const isBlocked = await checkMarketplaceIsFiltered(collection, [
      // PaymentProcessor
      "0x009a1d8de8d80fcd9c6aaafe97a237dc663f2978",
    ]);
    expect(isBlocked).toBe(false);
  });

  // sepolia testnet
  // added-to-allowlist 0x7d96af8888c3828ea21b7e5e304008aacec94a6a26e9462f528ff6ce53e073b9
  // removed-from-allowlist 0x20b52a0890b8669d966a0f777509236eb839eafa4c3c8bff3e6ea41302586b52
  // verified-eoa-signature 0x9c7fc3f99eb8ede75ca4635121061bf8056e6e62cab9dc20b2042c9c9fef6c8b
});
