import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { AddressZero } from "@ethersproject/constants";
import { increaseUserNonce, getNextUserNonce } from "@/utils/payment-processor-v2";
import { describe, it, expect } from "@jest/globals";

describe("Payment Processor V2 - Offchain Nonce", () => {
  it("save", async () => {
    const marketplace = AddressZero;
    const user = "0x1f9090aae28b8a3dceadf281b0f12828e676c326";
    const { nonce, userNonce } = await getNextUserNonce(marketplace, user);
    await increaseUserNonce(marketplace, user, nonce);
    const { nonce: nonce2, userNonce: userNonce2 } = await getNextUserNonce(marketplace, user);
    expect(Number(userNonce) + 1).toBe(Number(userNonce2));
    expect(nonce).not.toBe(nonce2);
  });
});
