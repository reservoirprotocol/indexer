import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { jest, describe, it, expect } from "@jest/globals";
import * as paymentProcessorV2 from "@/utils/offchain-cancel/payment-processor-v2";

jest.setTimeout(1000 * 1000);

describe("Offchain cancel", () => {
  it("custom-name", async () => {
    const cancelSignature = await paymentProcessorV2.generateOffChainCancellationSignatureData([
      "0x642b0065290ec7a15092c06c678c50681f889bd644ffee92b6259cee54f69da0",
    ]);
    expect(cancelSignature.domain.name).toBe("Magic Eden");
  });
});
