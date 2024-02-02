import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import {
  PendingTxsListener,
  handlePendingMessage,
  setPendingTxsAsComplete,
  getPendingItems,
} from "../../utils/pending-txs";
import { describe, jest, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

describe("PendingState", () => {
  it("handle", async () => {
    const listener = new PendingTxsListener(true);
    for (let index = 0; index < 3; index++) {
      const sampleMessage = await listener.getSamlePendingTx((parsed) => {
        return !parsed?.txContents.input.includes(`0xfd9f1e1`);
      });
      const pendingTokens = await handlePendingMessage(sampleMessage);
      if (!pendingTokens?.length) continue;
      const contract = pendingTokens[0].contract;
      const pendingTokenIdsBefore = await getPendingItems(contract);
      const recent = await getPendingItems();
      await listener.watchTxCompleted(sampleMessage.txHash);
      await new Promise((resolve) => {
        setTimeout(() => resolve(1), 5 * 1000);
      });

      await setPendingTxsAsComplete([sampleMessage.txHash]);
      const pendingTokenIds = await getPendingItems(contract);
      expect(pendingTokenIds.length).toBe(0);
      expect(pendingTokenIdsBefore).not.toBe(0);
      expect(recent).not.toBe(0);
      break;
    }
  });
});
