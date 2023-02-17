import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { assignRoyaltiesToFillEvents } from "@/events-sync/handlers/royalties";
import { getRoyalties } from "@/utils/royalties";
import { getFillEventsFromTx } from "@/events-sync/handlers/royalties";

jest.setTimeout(1000 * 1000);

jest.mock("@/utils/royalties");

const mockGetRoyalties = getRoyalties as jest.MockedFunction<typeof getRoyalties>;

type TestCase = {
  name: string;
  tx: string;
  royaltyFeeBps: number;
  marketplaceFeeBps: number;
};

describe("Royalties - X2Y2", () => {
  const TEST_COLLECTION = "0x33c6eec1723b12c46732f7ab41398de45641fa42";
  const TEST_KIND = "x2y2";
  const testFeeExtract = async (
    txHash: string,
    { royaltyFeeBps, marketplaceFeeBps }: { royaltyFeeBps: number; marketplaceFeeBps: number }
  ) => {
    mockGetRoyalties.mockImplementation(async (contract: string) => {
      return contract === TEST_COLLECTION
        ? [
            {
              recipient: "0x459fe44490075a2ec231794f9548238e99bf25c0",
              bps: 750,
            },
          ]
        : [];
    });
    const { fillEvents } = await getFillEventsFromTx(txHash);
    await assignRoyaltiesToFillEvents(fillEvents);

    for (let index = 0; index < fillEvents.length; index++) {
      const fillEvent = fillEvents[index];
      if (fillEvent.orderKind != TEST_KIND) {
        continue;
      }
      if (fillEvent.contract === TEST_COLLECTION) {
        expect(fillEvent.royaltyFeeBps).toEqual(royaltyFeeBps);
      }

      expect(fillEvent.marketplaceFeeBps).toEqual(marketplaceFeeBps);
    }
  };
  const txIds: TestCase[] = [
    {
      name: "single-sale",
      tx: "0x57f5cfd614041cabab94a8c820a0ebcfd137ceec9db51bd5b47e2ca160507614",
      royaltyFeeBps: 750,
      marketplaceFeeBps: 50,
    },
    {
      name: "multiple-sale",
      tx: "0xe99d984cec8b8b5c57c4648a827203aa9a76efc6d2a7fab7d37c68a3d707b910",
      royaltyFeeBps: 0,
      marketplaceFeeBps: 50,
    },
    {
      name: "multiple-sale-gem-swap",
      tx: "0x330a369f5c321db9d267732a1a440fba7b32f89da8f200a30933777b72a2af2a",
      royaltyFeeBps: 750,
      marketplaceFeeBps: 50,
    },
    {
      name: "multiple-sale-with-different-collection",
      tx: "0x50bca012a66e1227e2ce11f74e2787043a13703b37be903f166c14b79680c54d",
      royaltyFeeBps: 0,
      marketplaceFeeBps: 50,
    },
  ];
  for (const { name, tx, royaltyFeeBps, marketplaceFeeBps } of txIds) {
    it(`${name}`, async () => testFeeExtract(tx, { royaltyFeeBps, marketplaceFeeBps }));
  }
});
