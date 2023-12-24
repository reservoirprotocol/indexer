import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { assignRoyaltiesToFillEvents } from "@/events-sync/handlers/royalties";
import { getFillEventsFromTx } from "@/events-sync/handlers/royalties/utils";
import { jest, describe, it, expect } from "@jest/globals";
import { getRoyalties } from "@/utils/royalties";

jest.setTimeout(1000 * 1000);

jest.mock("@/utils/royalties");
const mockGetRoyalties = getRoyalties as jest.MockedFunction<typeof getRoyalties>;

jest.setTimeout(1000 * 1000);
jest.mock("@/utils/royalties");

describe("Royalties Router", () => {
  it("router-1", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0x1e998171c0af9f93a2b3bf2999c65bb84b9bf664d91c08cf29f1b9d4fd8d6bc6"
    );

    const testCollectionRoyalties = [
      {
        collection: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        data: [
          {
            bps: 250,
            recipient: "0xaae7ac476b117bccafe2f05f582906be44bc8ff1",
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
        contract: "0xa319c382a702682129fcbf55d514e61a16f97f9c",
        tokenId: "15000054",
        royaltyFeeBps: 1000,
        marketplaceFeeBps: 50,
      },
    ];

    await assignRoyaltiesToFillEvents(fillEvents, false, true);

    for (let index = 0; index < fillEvents.length; index++) {
      const fillEvent = fillEvents[index];
      const matchFee = feesList.find(
        (c) => c.contract === fillEvent.contract && c.tokenId === fillEvent.tokenId
      );
      // console.log("fillEvent", fillEvent)
      if (matchFee) {
        expect(fillEvent.royaltyFeeBps).toEqual(matchFee.royaltyFeeBps);
        expect(fillEvent.marketplaceFeeBps).toEqual(matchFee.marketplaceFeeBps);
      }
    }
  });

  it("router-2", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0x8298bc9d022c6b68bd650f69bea148598839ebba184bb6773993d5e7918d2aa1"
    );

    const testCollectionRoyalties = [
      {
        collection: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        data: [
          {
            bps: 250,
            recipient: "0xaae7ac476b117bccafe2f05f582906be44bc8ff1",
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
        contract: "0xa319c382a702682129fcbf55d514e61a16f97f9c",
        tokenId: "15000054",
        royaltyFeeBps: 999,
        marketplaceFeeBps: 50,
      },
    ];

    await assignRoyaltiesToFillEvents(fillEvents, false, true);

    for (let index = 0; index < fillEvents.length; index++) {
      const fillEvent = fillEvents[index];
      const matchFee = feesList.find(
        (c) => c.contract === fillEvent.contract && c.tokenId === fillEvent.tokenId
      );

      if (matchFee) {
        expect(fillEvent.royaltyFeeBps).toEqual(matchFee.royaltyFeeBps);
        expect(fillEvent.marketplaceFeeBps).toEqual(matchFee.marketplaceFeeBps);
      }
    }
  });
});
