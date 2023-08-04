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
  it("extract-case1", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0xA2F1F678555F2CE4F87C7D45596429BFD844F7914B770C948261602C15EE0DB1"
    );

    const testCollectionRoyalties = [
      {
        collection: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        data: [
          {
            bps: 250,
            recipient: "0xaae7ac476b117bccafe2f05f582906be44bc8ff1",
          },
          {
            bps: 250,
            recipient: "0xa858ddc0445d8131dac4d1de01f834ffcba52ef1",
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
        royaltyFeeBps: 0,
        marketplaceFeeBps: 200,
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

  it("erc1155-multiple-sales", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0x54a3b6a7ab7dd3f9f1df3ad3b0b2e274a40ae991bb5d4378287899e744082c45"
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
    ];

    mockGetRoyalties.mockImplementation(async (contract: string) => {
      const matched = testCollectionRoyalties.find((c) => c.collection === contract);
      return matched?.data ?? [];
    });

    const feesList = [
      {
        contract: "0x33fd426905f149f8376e227d0c9d3340aad17af1",
        tokenId: "54",
        royaltyFeeBps: 690,
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

  it("multiple-sales-with-wrong", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0x02d831e6e0f967fbfc0975935c7ed35c328961c39373c0656ea17093106cd760"
    );

    const testCollectionRoyalties = [
      {
        collection: "0x5bd815fd6c096bab38b4c6553cfce3585194dff9",
        data: [
          {
            bps: 500,
            recipient: "0xdcaae62542aa20e6a8243b2407f18ddb36e83014",
          },
        ],
      },
      {
        collection: "0xb32979486938aa9694bfc898f35dbed459f44424",
        data: [
          {
            bps: 1000,
            recipient: "0x6d4219003714632c88b3f01d8591bee545f33184",
          },
        ],
      },
      {
        collection: "0x33fd426905f149f8376e227d0c9d3340aad17af1",
        data: [
          {
            bps: 690,
            recipient: "0x1b1289e34fe05019511d7b436a5138f361904df0",
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
        contract: "0x33fd426905f149f8376e227d0c9d3340aad17af1",
        tokenId: "8",
        royaltyFeeBps: 690,
        marketplaceFeeBps: 250,
      },
      {
        contract: "0xb32979486938aa9694bfc898f35dbed459f44424",
        tokenId: "10055",
        royaltyFeeBps: 1000,
        marketplaceFeeBps: 250,
      },
      {
        contract: "0x5bd815fd6c096bab38b4c6553cfce3585194dff9",
        tokenId: "13055",
        royaltyFeeBps: 500,
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

  it("multiple-sales-case-1", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0x67533A3C28F93589B9899E2A822F3658ADF8AA9E754D807FBA0E80A46CA0C7D4"
    );

    const testCollectionRoyalties = [
      {
        collection: "0x5bd815fd6c096bab38b4c6553cfce3585194dff9",
        data: [
          {
            bps: 500,
            recipient: "0xdcaae62542aa20e6a8243b2407f18ddb36e83014",
          },
        ],
      },
      {
        collection: "0xb32979486938aa9694bfc898f35dbed459f44424",
        data: [
          {
            bps: 1000,
            recipient: "0x6d4219003714632c88b3f01d8591bee545f33184",
          },
        ],
      },
      {
        collection: "0x33fd426905f149f8376e227d0c9d3340aad17af1",
        data: [
          {
            bps: 690,
            recipient: "0x1b1289e34fe05019511d7b436a5138f361904df0",
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
        contract: "0x33fd426905f149f8376e227d0c9d3340aad17af1",
        tokenId: "8",
        royaltyFeeBps: 690,
        marketplaceFeeBps: 250,
      },
      {
        contract: "0xb32979486938aa9694bfc898f35dbed459f44424",
        tokenId: "10055",
        royaltyFeeBps: 1000,
        marketplaceFeeBps: 250,
      },
      {
        contract: "0x5bd815fd6c096bab38b4c6553cfce3585194dff9",
        tokenId: "13055",
        royaltyFeeBps: 500,
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

  it("multiple-sales-case-2", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0x97d65878fafc3e5ffe4ce1e288125bb84b4734004dc7d8575d4163fb13457a8d"
    );

    const testCollectionRoyalties = [
      {
        collection: "0xba30e5f9bb24caa003e9f2f0497ad287fdf95623",
        data: [
          {
            bps: 250,
            recipient: "0xa858ddc0445d8131dac4d1de01f834ffcba52ef1",
          },
        ],
      },
      {
        collection: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        data: [
          {
            bps: 250,
            recipient: "0xa858ddc0445d8131dac4d1de01f834ffcba52ef1",
          },
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
        contract: "0xba30e5f9bb24caa003e9f2f0497ad287fdf95623",
        tokenId: "8272",
        royaltyFeeBps: 0,
        marketplaceFeeBps: 250,
      },
      {
        contract: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        tokenId: "5300",
        royaltyFeeBps: 250,
        marketplaceFeeBps: 250,
      },
      {
        contract: "0x5bd815fd6c096bab38b4c6553cfce3585194dff9",
        tokenId: "13055",
        royaltyFeeBps: 500,
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

  it("multiple-sales-case-3", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0x4e982dd1572f9c7559340b7ec0ad1ee9cd26b79af75c79ac9c044cd5e0316638"
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
      {
        collection: "0x49cf6f5d44e70224e2e23fdcdd2c053f30ada28b",
        data: [
          {
            bps: 500,
            recipient: "0xe65b6865dbce299ae6a20efcc7543362540741d8",
          },
        ],
      },
      {
        collection: "0x8a90cab2b38dba80c64b7734e58ee1db38b8992e",
        data: [
          {
            bps: 500,
            recipient: "0xd1f124cc900624e1ff2d923180b3924147364380",
          },
        ],
      },
      {
        collection: "0xed5af388653567af2f388e6224dc7c4b3241c544",
        data: [
          {
            bps: 500,
            recipient: "0xb4d24dacbdffa1bbf9a624044484b3feeb7fdf74",
          },
        ],
      },
      {
        collection: "0x1a92f7381b9f03921564a437210bb9396471050c",
        data: [
          {
            bps: 500,
            recipient: "0xd98d29beb788ff04e7a648775fcb083282ae9c4b",
          },
        ],
      },
      {
        collection: "0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7",
        data: [
          {
            bps: 500,
            recipient: "0xa858ddc0445d8131dac4d1de01f834ffcba52ef1",
          },
        ],
      },
      {
        collection: "0xe785e82358879f061bc3dcac6f0444462d4b5330",
        data: [
          {
            bps: 400,
            recipient: "0xb1ab2274b58b23d2a701f164b9a641efc69bc3f1",
          },
        ],
      },
      {
        collection: "0x306b1ea3ecdf94ab739f1910bbda052ed4a9f949",
        data: [
          {
            bps: 500,
            recipient: "0xb4d24dacbdffa1bbf9a624044484b3feeb7fdf74",
          },
        ],
      },
      {
        collection: "0x59468516a8259058bad1ca5f8f4bff190d30e066",
        data: [
          {
            bps: 500,
            recipient: "0x8fe67ebcf516efb408e537bd390dfde4fae7448d",
          },
        ],
      },
      {
        collection: "0x1cb1a5e65610aeff2551a50f76a87a7d3fb649c6",
        data: [
          {
            bps: 250,
            recipient: "0x794b675c0e69fe8f586909ca98915243cf689672",
          },
        ],
      },
      {
        collection: "0x2acab3dea77832c09420663b0e1cb386031ba17b",
        data: [
          {
            bps: 500,
            recipient: "0x0aa795e44c5e54b363d119c89b1658781d007d7e",
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
        tokenId: "5372",
        royaltyFeeBps: 0,
        marketplaceFeeBps: 250,
        royaltyFeeBreakdown: [],
        marketplaceFeeBreakdown: [
          {
            recipient: "0x0000a26b00c1f0df003000390027140000faa719",
            bps: 250,
          },
        ],
      },
      {
        contract: "0x49cf6f5d44e70224e2e23fdcdd2c053f30ada28b",
        tokenId: "13509",
        royaltyFeeBps: 500,
        marketplaceFeeBps: 250,
        royaltyFeeBreakdown: [
          {
            recipient: "0xe65b6865dbce299ae6a20efcc7543362540741d8",
            bps: 500,
          },
        ],
        marketplaceFeeBreakdown: [
          {
            recipient: "0x0000a26b00c1f0df003000390027140000faa719",
            bps: 250,
          },
        ],
      },
      {
        contract: "0x8a90cab2b38dba80c64b7734e58ee1db38b8992e",
        tokenId: "2280",
        royaltyFeeBps: 500,
        marketplaceFeeBps: 250,
        royaltyFeeBreakdown: [
          {
            recipient: "0xd1f124cc900624e1ff2d923180b3924147364380",
            bps: 500,
          },
        ],
        marketplaceFeeBreakdown: [
          {
            recipient: "0x0000a26b00c1f0df003000390027140000faa719",
            bps: 250,
          },
        ],
      },
      {
        contract: "0xed5af388653567af2f388e6224dc7c4b3241c544",
        tokenId: "3881",
        royaltyFeeBps: 0,
        marketplaceFeeBps: 250,
        royaltyFeeBreakdown: [],
        marketplaceFeeBreakdown: [
          {
            recipient: "0x0000a26b00c1f0df003000390027140000faa719",
            bps: 250,
          },
        ],
      },
      {
        contract: "0x1a92f7381b9f03921564a437210bb9396471050c",
        tokenId: "2220",
        royaltyFeeBps: 500,
        marketplaceFeeBps: 250,
        royaltyFeeBreakdown: [
          {
            recipient: "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0",
            bps: 500,
          },
        ],
        marketplaceFeeBreakdown: [
          {
            recipient: "0x0000a26b00c1f0df003000390027140000faa719",
            bps: 250,
          },
        ],
      },
      {
        contract: "0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7",
        tokenId: "17713",
        royaltyFeeBps: 0,
        marketplaceFeeBps: 250,
        royaltyFeeBreakdown: [],
        marketplaceFeeBreakdown: [
          {
            recipient: "0x0000a26b00c1f0df003000390027140000faa719",
            bps: 250,
          },
        ],
      },
      {
        contract: "0xe785e82358879f061bc3dcac6f0444462d4b5330",
        tokenId: "3836",
        royaltyFeeBps: 400,
        marketplaceFeeBps: 250,
        royaltyFeeBreakdown: [
          {
            recipient: "0xb1ab2274b58b23d2a701f164b9a641efc69bc3f1",
            bps: 400,
          },
        ],
        marketplaceFeeBreakdown: [
          {
            recipient: "0x0000a26b00c1f0df003000390027140000faa719",
            bps: 250,
          },
        ],
      },
      {
        contract: "0x306b1ea3ecdf94ab739f1910bbda052ed4a9f949",
        tokenId: "11059",
        royaltyFeeBps: 0,
        marketplaceFeeBps: 250,
        royaltyFeeBreakdown: [],
        marketplaceFeeBreakdown: [
          {
            recipient: "0x0000a26b00c1f0df003000390027140000faa719",
            bps: 250,
          },
        ],
      },
      {
        contract: "0x59468516a8259058bad1ca5f8f4bff190d30e066",
        tokenId: "3545",
        royaltyFeeBps: 500,
        marketplaceFeeBps: 250,
        royaltyFeeBreakdown: [
          {
            recipient: "0x8fe67ebcf516efb408e537bd390dfde4fae7448d",
            bps: 500,
          },
        ],
        marketplaceFeeBreakdown: [
          {
            recipient: "0x0000a26b00c1f0df003000390027140000faa719",
            bps: 250,
          },
        ],
      },
      {
        contract: "0x1cb1a5e65610aeff2551a50f76a87a7d3fb649c6",
        tokenId: "4237",
        royaltyFeeBps: 250,
        marketplaceFeeBps: 250,
        royaltyFeeBreakdown: [
          {
            recipient: "0x794b675c0e69fe8f586909ca98915243cf689672",
            bps: 250,
          },
        ],
        marketplaceFeeBreakdown: [
          {
            recipient: "0x0000a26b00c1f0df003000390027140000faa719",
            bps: 250,
          },
        ],
      },
      {
        contract: "0x2acab3dea77832c09420663b0e1cb386031ba17b",
        tokenId: "9682",
        royaltyFeeBps: 500,
        marketplaceFeeBps: 250,
        royaltyFeeBreakdown: [
          {
            recipient: "0x7b42a219bb14d0719757a391d7cc6aa7f371e144",
            bps: 500,
          },
        ],
        marketplaceFeeBreakdown: [
          {
            recipient: "0x0000a26b00c1f0df003000390027140000faa719",
            bps: 250,
          },
        ],
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
      }
    }
  });

  it("usdc-case", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0xb24a8ac1a3368e950a155d9e46154dfac54cc0dc4de94aa9f802982ce104803e"
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
        contract: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        tokenId: "7159",
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

      // console.log("fillEvent", fillEvent.contract, fillEvent.tokenId);
      if (matchFee) {
        expect(fillEvent.royaltyFeeBps).toEqual(matchFee.royaltyFeeBps);
        expect(fillEvent.marketplaceFeeBps).toEqual(matchFee.marketplaceFeeBps);
      }
    }
  });

  it("wyvern-case", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0x67533A3C28F93589B9899E2A822F3658ADF8AA9E754D807FBA0E80A46CA0C7D4"
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
        contract: "0x49cf6f5d44e70224e2e23fdcdd2c053f30ada28b",
        tokenId: "8471",
        royaltyFeeBps: 0,
        marketplaceFeeBps: 750,
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

  it("mev-case", async () => {
    const { fillEvents } = await getFillEventsFromTx(
      "0xd9c5f0af7ff6113df4153bcd4aa5ea25471a534e4b6baa5c81277bc5eeda1ef2"
    );

    const testCollectionRoyalties = [
      {
        collection: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        data: [
          {
            bps: 250,
            recipient: "0xaae7ac476b117bccafe2f05f582906be44bc8ff1",
          },
          {
            bps: 250,
            recipient: "0xa858ddc0445d8131dac4d1de01f834ffcba52ef1",
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
        tokenId: "8872",
        royaltyFeeBps: 250,
        marketplaceFeeBps: 0,
      },
    ];
    // console.log("fillEvents", fillEvents.length)
    await assignRoyaltiesToFillEvents(fillEvents, false, true);
    for (let index = 0; index < fillEvents.length; index++) {
      const fillEvent = fillEvents[index];
      //console.log(fillEvent);
      const matchFee = feesList.find(
        (c) => c.contract === fillEvent.contract && c.tokenId === fillEvent.tokenId
      );
      if (matchFee) {
        //console.log(fillEvent);
        expect(fillEvent.royaltyFeeBps).toEqual(matchFee.royaltyFeeBps);
        expect(fillEvent.marketplaceFeeBps).toEqual(matchFee.marketplaceFeeBps);
      }
    }
  });

  // multiple sales
  // 0x2f76c9669b424dd67fdbdddab5bc41b12d1f0bff9e22a7fe38ebef5d4214990e
  // 0x4e982dd1572f9c7559340b7ec0ad1ee9cd26b79af75c79ac9c044cd5e0316638
});
