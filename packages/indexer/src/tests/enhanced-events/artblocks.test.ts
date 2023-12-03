import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { getEnhancedEventsFromTx } from "../utils/events";
import { extractEventsBatches } from "@/events-sync/index";
import { expect, test, describe } from "@jest/globals";

describe("EnhancedEvents Artblocks", () => {
  test("detects events", async () => {
    const txHash = "0x097ad9ab46cac02386b1795b75f9ce108ba958ead0d08e8a453c06b07992140c";
    const enhancedEvents = await getEnhancedEventsFromTx(txHash);

    const eventBatches = await extractEventsBatches(enhancedEvents, true);
    for (const batch of eventBatches) {
      const onChainData = await processEventsBatch(batch, true);
      expect(onChainData.mints[0]).not.toBe(null);
      expect(onChainData.mints[0].data.standard).toBe("artblocks");
    }
  });
});
