import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { getEnhancedEventsFromTx } from "../utils/events";
import { extractEventsBatches } from "@/events-sync/index";
import { expect, test, describe } from "@jest/globals";

describe("EnhancedEvents Titlesxyz", () => {
  test("detects events", async () => {
    const txHash = "0x4646fb8cb7e9fc09bbba6252eaa704f6f4173f5f885f73dcf803912eb265591e";
    const enhancedEvents = await getEnhancedEventsFromTx(txHash);

    const eventBatches = await extractEventsBatches(enhancedEvents, true);
    for (const batch of eventBatches) {
      const onChainData = await processEventsBatch(batch, true);
      expect(onChainData.mints[0]).not.toBe(null);
      expect(onChainData.mints[0].data.standard).toBe("titlesxyz");
    }
  });
});
