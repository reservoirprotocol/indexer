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

  it("extract-with-seaport-orderdata", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0x3ed3019a036bd2c8cb3f6e7896417fe14851569d97814d919f9f8f80fbc0bb04"
    );

    const testCollectionRoyalties = [
      {
        collection: "0x880af717abba38f31ca21673843636a355fb45f3",
        data: [
          {
            bps: 750,
            recipient: "0x834cee2c58b212d37be016f303bc46e8184bd864",
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
        contract: "0x880af717abba38f31ca21673843636a355fb45f3",
        tokenId: "878",
        royaltyFeeBps: 750,
        marketplaceFeeBps: 250,
        paidFullRoyalty: true,
      },
      {
        contract: "0x880af717abba38f31ca21673843636a355fb45f3",
        tokenId: "684",
        royaltyFeeBps: 50,
        marketplaceFeeBps: 250,
        paidFullRoyalty: false,
      },
      {
        contract: "0x880af717abba38f31ca21673843636a355fb45f3",
        tokenId: "49",
        royaltyFeeBps: 0,
        marketplaceFeeBps: 250,
        paidFullRoyalty: false,
      },
    ];

    await assignRoyaltiesToFillEvents(fillEvents, false, true);
    for (let index = 0; index < fillEvents.length; index++) {
      const fillEvent = fillEvents[index];
      const matchFee = feesList.find(
        (c) => c.contract === fillEvent.contract && c.tokenId === fillEvent.tokenId
      );

      // console.log(fillEvent.tokenId, fillEvent.royaltyFeeBps)
      if (matchFee) {
        expect(fillEvent.royaltyFeeBps).toEqual(matchFee.royaltyFeeBps);
        expect(fillEvent.marketplaceFeeBps).toEqual(matchFee.marketplaceFeeBps);
        expect(fillEvent.paidFullRoyalty).toEqual(matchFee.paidFullRoyalty);
      }
    }
  });

  it("bps-precision", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0xd2a52b05d01093d5038baa73cb4753e0b3dd638aac89dd04da266c29a8955c61"
    );

    const testCollectionRoyalties = [
      {
        collection: "0x880af717abba38f31ca21673843636a355fb45f3",
        data: [
          {
            bps: 750,
            recipient: "0x834cee2c58b212d37be016f303bc46e8184bd864",
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
        contract: "0x99a9b7c1116f9ceeb1652de04d5969cce509b069",
        tokenId: "462000305",
        royaltyFeeBps: 750,
        marketplaceFeeBps: 0,
        paidFullRoyalty: true,
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
        expect(fillEvent.paidFullRoyalty).toEqual(matchFee.paidFullRoyalty);
      }
    }
  });

  it("duplicate-recipients", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0x64b4a3fde77a98ea57e55a3ff2e72433c267a0ab840af381b1f82db0864068b4"
    );

    const testCollectionRoyalties = [
      {
        collection: "0xe13efbeeb249b52c0de2a07635d9a816605176c5",
        data: [
          {
            bps: 1000,
            recipient: "0xbf3ca180806dbcafa50fdaf8c46d7765e0f901f4",
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
        contract: "0xe13efbeeb249b52c0de2a07635d9a816605176c5",
        tokenId: "5",
        royaltyFeeBps: 1000,
        marketplaceFeeBps: 0,
        paidFullRoyalty: true,
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
        expect(fillEvent.paidFullRoyalty).toEqual(matchFee.paidFullRoyalty);
      }
    }
  });

  it("payment-processor", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0xf0db360b45f23477981dea542c947a92c377278c8845fedf7e4b2ab466a29b59"
    );

    const testCollectionRoyalties = [
      {
        collection: "0xa87dbcfa18adb7c00593e2c2469d83213c87aecd",
        data: [
          {
            bps: 650,
            recipient: "0x1e818f09233942044a18b8d78ebcc36456b5d280",
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
        contract: "0xa87dbcfa18adb7c00593e2c2469d83213c87aecd",
        tokenId: "3",
        royaltyFeeBps: 750,
        marketplaceFeeBps: 0,
        paidFullRoyalty: true,
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
        expect(fillEvent.paidFullRoyalty).toEqual(matchFee.paidFullRoyalty);
      }
    }
  });
});
