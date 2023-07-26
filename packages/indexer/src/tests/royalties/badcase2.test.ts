import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { assignRoyaltiesToFillEvents } from "@/events-sync/handlers/royalties";
import { getFillEventsFromTx } from "@/events-sync/handlers/royalties/utils";
import { jest, describe, it, expect } from "@jest/globals";
import { getRoyalties } from "@/utils/royalties";

jest.setTimeout(1000 * 1000);

const mockGetRoyalties = getRoyalties as jest.MockedFunction<typeof getRoyalties>;

jest.setTimeout(1000 * 1000);
jest.mock("@/utils/royalties");

describe("Royalties", () => {
  it("extract-case2", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0xf01086790d4272b224065149131315cd74f84634d43945109b559773671dc8e7"
    );

    const testCollectionRoyalties = [
      {
        collection: "0x942bc2d3e7a589fe5bd4a5c6ef9727dfd82f5c8a",
        data: [
          {
            bps: 500,
            recipient: "0x2776621ff536af829919ab6cba8db434aeba43f9",
          },
          {
            bps: 250,
            recipient: "0x05b0658c6d0ed423e39da60f8feddd460d838f5f",
          },
        ],
      },
    ];

    mockGetRoyalties.mockImplementation(async (contract: string) => {
      const matched = testCollectionRoyalties.find((c) => c.collection === contract);
      return matched?.data ?? [];
    });

    const feesList = [
      {
        contract: "0x942bc2d3e7a589fe5bd4a5c6ef9727dfd82f5c8a",
        tokenId: "31419",
        royaltyFeeBps: 750,
        marketplaceFeeBps: 250,
        paidFullRoyalty: true,
      },
    ];
    // console.log("fillEvents", fillEvents.length)
    await assignRoyaltiesToFillEvents(fillEvents, false, true);
    for (let index = 0; index < fillEvents.length; index++) {
      const fillEvent = fillEvents[index];
      const matchFee = feesList.find(
        (c) => c.contract === fillEvent.contract && c.tokenId === fillEvent.tokenId
      );
      if (matchFee) {
        expect(fillEvent.royaltyFeeBps).toEqual(matchFee.royaltyFeeBps);
        expect(fillEvent.marketplaceFeeBps).toEqual(matchFee.marketplaceFeeBps);
        expect(fillEvent.paidFullRoyalty).toEqual(matchFee.paidFullRoyalty);
      }
    }
  });
});
