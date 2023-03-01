import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { getEnhancedEventsFromTx, processEventsBatch } from "@/events-sync/handlers";
import { extractEventsBatches } from "@/events-sync/index";
import { expect, test, describe } from "@jest/globals";

describe("Seaport", () => {
  test("order-validate-old", async () => {
    const txHash = "0x5145be0b8833060a9b9412650179ad4d2a19ca86dcefac7efaaec097ccef09d4";
    const enhancedEvents = await getEnhancedEventsFromTx(txHash);

    const eventBatches = await extractEventsBatches(enhancedEvents, true);
    for (const batch of eventBatches) {
      const onChainData = await processEventsBatch(batch, true);
      expect(onChainData.orders[0]).not.toBe(null);
    }
  });

  test("order-validate-new", async () => {
    const txHash = "0xa930e861cfda152314f47b2428473cb356d76cb25f03915ffcd258121788895c";
    const enhancedEvents = await getEnhancedEventsFromTx(txHash);
    const eventBatches = await extractEventsBatches(enhancedEvents, true);
    for (const batch of eventBatches) {
      await processEventsBatch(batch, true);
    }
  });
});
