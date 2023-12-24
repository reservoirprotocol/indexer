import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { jest, describe, it, expect } from "@jest/globals";
import { parseBlock } from "@/events-sync/handlers/royalties/utils";

jest.setTimeout(1000 * 1000);

describe("Event Sync", () => {
  it("syncEvents", async () => {
    const allOnChainData = await parseBlock(18715659);
    for (const data of allOnChainData) {
      const has = data.batch.events.find((c) =>
        c.data.find(
          (d) =>
            d.baseEventParams.txHash ===
            "0x616f93cbc7414c7b6e205505adf463cfc11942169b92897c08ea57e3c3e7c835"
        )
      );
      if (has) {
        const matchFill = data.onChainData.fillEventsPartial.find(
          (d) => d.orderId === "0x68cd9b948a46959a670319af429fadae934486de9f58e7bf8ba2894358733146"
        );
        expect(matchFill).not.toBe(undefined);
      }
    }
  });
});
