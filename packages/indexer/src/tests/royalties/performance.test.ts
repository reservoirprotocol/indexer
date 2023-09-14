import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { assignRoyaltiesToFillEvents } from "@/events-sync/handlers/royalties/index";
import { getRoyalties } from "@/utils/royalties";
import { getFillEventsFromTx } from "@/events-sync/handlers/royalties/utils";
import { jest, describe, it } from "@jest/globals";

jest.setTimeout(1000 * 1000);

jest.mock("@/utils/royalties");
const mockGetRoyalties = getRoyalties as jest.MockedFunction<typeof getRoyalties>;

// type TestCase = {
//   name: string;
//   tx: string;
// };

describe("Royalties - Router normalize", () => {
  const testCollectionRoyalties = [
    {
      collection: "0x33c6eec1723b12c46732f7ab41398de45641fa42",
      data: [
        {
          recipient: "0x459fe44490075a2ec231794f9548238e99bf25c0",
          bps: 750,
        },
      ],
    },
    {
      collection: "0xe1d7a7c25d6bacd2af454a7e863e7b611248c3e5",
      data: [
        {
          recipient: "0x5fc32481222d0444d4cc2196a79e544ce42a0ec5",
          bps: 250,
        },
      ],
    },
  ];

  const testPerformance = async () => {
    const txIds = [
      ["wrong", "0x88575fc2c9fab4b7b2d47ae2946e5b21e754399f486cc843251b35d9c0324c1d"],
      // ["single sale", "0x93de26bea65832e10c253f6cd0bf963619d7aef63695b485d9df118dd6bd4ae4"],
      // [
      //   "multiple sales with different protocols(x2y2+seaport)",
      //   "0xa451be1bd9edef5cab318e3cb0fbff6a6f9955dfd49e484caa37dbaa6982a1ed",
      // ],
      // [
      //   "multiple sales with different collections",
      //   "0xfef549999f91e499dc22ad3d635fd05949d1a7fda1f7c5827986f23fc341f828",
      // ],
      [
        "multiple sales with same collection",
        "0x28cb9371d6d986a00e19797270c542ad6901abec7b67bbef7b2ae947b3c37c0b",
      ],
      // ["test", "0x60355582e37bab762807c3066ada4e79cc6432a745551f06ae8c534650aecca7"],
    ];

    mockGetRoyalties.mockImplementation(async (contract: string) => {
      const matched = testCollectionRoyalties.find((c) => c.collection === contract);
      return matched?.data ?? [];
    });

    for (let index = 0; index < txIds.length; index++) {
      const [, txHash] = txIds[index];

      const { fillEvents } = await getFillEventsFromTx(txHash);
      await assignRoyaltiesToFillEvents(fillEvents, true);
    }
  };

  it(`performance`, async () => testPerformance());
});
