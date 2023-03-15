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

describe("Royalties", () => {
  it("extract-case1", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0xA2F1F678555F2CE4F87C7D45596429BFD844F7914B770C948261602C15EE0DB1"
    );

    const testCollectionRoyalties = [
      {
        collection: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        data: [
          {
            recipient: "0xa858ddc0445d8131dac4d1de01f834ffcba52ef1",
            bps: 250,
          },
        ],
      },
      {
        collection: "0x60e4d786628fea6478f785a6d7e704777c86a7c6",
        data: [
          {
            recipient: "0xa858ddc0445d8131dac4d1de01f834ffcba52ef1",
            bps: 250,
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
        contract: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        tokenId: "5449",
        royaltyFeeBps: 250,
        marketplaceFeeBps: 200,
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

  it("multiple-sales-one-call-and-same-royaltie", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0x92F4F9B71BD3E655F43E7F9C1DCA4EE85F7EF37B7BEDE67B652C5D5A8F6402EF"
    );

    const testCollectionRoyalties = [
      {
        collection: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        data: [
          {
            recipient: "0xa858ddc0445d8131dac4d1de01f834ffcba52ef1",
            bps: 250,
          },
        ],
      },
      {
        collection: "0x60e4d786628fea6478f785a6d7e704777c86a7c6",
        data: [
          {
            recipient: "0xa858ddc0445d8131dac4d1de01f834ffcba52ef1",
            bps: 250,
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
        contract: "0x60e4d786628fea6478f785a6d7e704777c86a7c6",
        tokenId: "5766",
        royaltyFeeBps: 250,
        marketplaceFeeBps: 50,
      },
      {
        contract: "0x60e4d786628fea6478f785a6d7e704777c86a7c6",
        tokenId: "8474",
        royaltyFeeBps: 250,
        marketplaceFeeBps: 50,
      },
      {
        contract: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        tokenId: "2897",
        royaltyFeeBps: 250,
        marketplaceFeeBps: 250,
      },
      {
        contract: "0x60e4d786628fea6478f785a6d7e704777c86a7c6",
        tokenId: "15323",
        royaltyFeeBps: 250,
        marketplaceFeeBps: 250,
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

  it("case-3", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0x1D51F3EDABF2FDA8423BD94C905BBC3D7574CEF76B99E8C200E4317BAB086FFC"
    );

    const testCollectionRoyalties = [
      {
        collection: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        data: [
          {
            recipient: "0xa858ddc0445d8131dac4d1de01f834ffcba52ef1",
            bps: 250,
          },
        ],
      },
      {
        collection: "0x60e4d786628fea6478f785a6d7e704777c86a7c6",
        data: [
          {
            recipient: "0xa858ddc0445d8131dac4d1de01f834ffcba52ef1",
            bps: 250,
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
        contract: "0x60e4d786628fea6478f785a6d7e704777c86a7c6",
        tokenId: "5766",
        royaltyFeeBps: 250,
        marketplaceFeeBps: 50,
      },
      {
        contract: "0x60e4d786628fea6478f785a6d7e704777c86a7c6",
        tokenId: "8474",
        royaltyFeeBps: 250,
        marketplaceFeeBps: 50,
      },
      {
        contract: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        tokenId: "2897",
        royaltyFeeBps: 250,
        marketplaceFeeBps: 250,
      },
      {
        contract: "0x60e4d786628fea6478f785a6d7e704777c86a7c6",
        tokenId: "15323",
        royaltyFeeBps: 250,
        marketplaceFeeBps: 250,
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
