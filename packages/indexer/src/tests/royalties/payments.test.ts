import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { splitPayments } from "@/events-sync/handlers/royalties/payments";
import { jest, describe, it, expect } from "@jest/globals";
import wyvern from "./__fixtures__/payments/wyvern.json";
import { PartialFillEvent } from "@/events-sync/handlers/royalties";

jest.setTimeout(1000 * 1000);

describe("Payments", () => {
  it("wyvern", async () => {
    const { hasMultiple, chunkedFillEvents, isReliable } = splitPayments(
      wyvern.fillEvents.map((c) => {
        return c as PartialFillEvent;
      }),
      wyvern.payments
    );

    const firstPayment = chunkedFillEvents[0];
    const payment = firstPayment.relatedPayments.find(
      (c) => c.token === "erc721:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d:6176"
    );
    expect(isReliable).toEqual(true);
    expect(hasMultiple).toEqual(true);
    expect(payment).not.toBe(null);
  });
});
