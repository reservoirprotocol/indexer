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

describe("Royalties - Blur", () => {
  const TEST_COLLECTION = "0x33c6eec1723b12c46732f7ab41398de45641fa42";
  const testFeeExtract = async (
    txHash: string,
    { royaltyFeeBps }: { royaltyFeeBps: number; marketplaceFeeBps: number }
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

      if (fillEvent.orderKind != "blur") continue;
      if (fillEvent.contract === TEST_COLLECTION) {
        expect(fillEvent.royaltyFeeBps).toEqual(royaltyFeeBps);
      }
    }
  };

  const txIds: TestCase[] = [
    {
      name: "single sale",
      tx: "0xb79639640d8cfe44decc069eb8d7a22f20776557e69f9e3ea3de5c86d9adf181",
      royaltyFeeBps: 750,
      marketplaceFeeBps: 0,
    },
    {
      name: "bulk-execute",
      tx: "0x29273e21b3704ea1c6284cc56e87d6baaecf183564be725c28d2b8c3a70cec3d",
      royaltyFeeBps: 0,
      marketplaceFeeBps: 0,
    },
  ];

  for (const { name, tx, royaltyFeeBps, marketplaceFeeBps } of txIds) {
    it(`${name}`, async () => testFeeExtract(tx, { royaltyFeeBps, marketplaceFeeBps }));
  }
});
