import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { assignRoyaltiesToFillEvents } from "@/events-sync/handlers/royalties";
import { getRoyalties } from "@/utils/royalties";
import { getFillEventsFromTx } from "@/events-sync/handlers/royalties/utils";
import { jest, describe, it, expect } from "@jest/globals";

jest.setTimeout(1000 * 1000);

jest.mock("@/utils/royalties");
const mockGetRoyalties = getRoyalties as jest.MockedFunction<typeof getRoyalties>;

type TestCase = {
  name: string;
  tx: string;
  royaltyFeeBps: number;
  marketplaceFeeBps: number;
};

describe("Royalties - LooksRare", () => {
  const TEST_COLLECTION = "0x33c6eec1723b12c46732f7ab41398de45641fa42";
  const TEST_KIND = "looks-rare";
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
    await assignRoyaltiesToFillEvents(fillEvents, false, true);

    for (let index = 0; index < fillEvents.length; index++) {
      const fillEvent = fillEvents[index];

      if (fillEvent.orderKind != TEST_KIND) continue;
      if (fillEvent.contract === TEST_COLLECTION) {
        expect(fillEvent.royaltyFeeBps).toEqual(royaltyFeeBps);
      }

      expect(fillEvent.marketplaceFeeBps).toEqual(marketplaceFeeBps);
    }
  };

  const txIds: TestCase[] = [
    {
      name: "single-sale",
      tx: "0xf2031ab1dfc341224702490cd45ea173a4e226959856d8480ceccca869a7dae0",
      royaltyFeeBps: 50,
      marketplaceFeeBps: 150,
    },
    {
      name: "multiple-sale-gem-swap",
      tx: "0x546a28f697d3bb2ba1e25132d0f1913306d3ee274266a5a2fc4d296840409402",
      royaltyFeeBps: 50,
      marketplaceFeeBps: 150,
    },
    {
      name: "multiple-sale-gem-swap-with-x2y2",
      tx: "0x330a369f5c321db9d267732a1a440fba7b32f89da8f200a30933777b72a2af2a",
      royaltyFeeBps: 750,
      marketplaceFeeBps: 200,
    },
  ];

  for (const { name, tx, royaltyFeeBps, marketplaceFeeBps } of txIds) {
    it(`${name}`, async () => testFeeExtract(tx, { royaltyFeeBps, marketplaceFeeBps }));
  }
});
