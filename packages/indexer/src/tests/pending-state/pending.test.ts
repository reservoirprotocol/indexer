import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import {
  PendingTxListenner,
  handlePendingMessage,
  getContractPendingTokens,
  setPendingAsComplete,
} from "../../utils/pending-transcation";
import { describe, jest, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("PendingState", () => {
  it("handle", async () => {
    const listener = new PendingTxListenner();
    for (let index = 0; index < 3; index++) {
      const sampleMessage = await listener.getSamlePendingTx((parsed) => {
        return !parsed?.txContents.input.includes(`0xfd9f1e1`);
      });
      const pendingTokens = await handlePendingMessage(sampleMessage);
      if (!pendingTokens?.length) continue;
      const contract = pendingTokens[0].contract;
      const pendingTokenIdsBefore = await getContractPendingTokens(contract);
      await listener.watchTxCompleted(sampleMessage.txHash);
      await new Promise((resolve) => {
        setTimeout(() => resolve(1), 5 * 1000);
      });
      await setPendingAsComplete([sampleMessage.txHash]);
      const pendingTokenIds = await getContractPendingTokens(contract);
      expect(pendingTokenIds.length).toBe(0);
      expect(pendingTokenIdsBefore).not.toBe(0);
      break;
    }
  });
});
