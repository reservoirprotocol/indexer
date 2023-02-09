import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { extractRoyalties } from "@/events-sync/handlers/royalties/core";
import { getRoyalties } from "@/utils/royalties";
import { getFillEventsFromTx } from "@/events-sync/handlers/royalties";
import { StateCache } from "@/events-sync/handlers/royalties";

jest.setTimeout(1000 * 1000);

jest.mock("@/utils/royalties");
const mockGetRoyalties = getRoyalties as jest.MockedFunction<typeof getRoyalties>;

type TestCase = {
  name: string;
  tx: string;
};

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
  const platformFees = [
    {
      kind: "x2y2",
      feeBps: 50,
    },
    {
      kind: "seaport",
      feeBps: 250,
    },
  ];

  const testFeeExtract = async (txHash: string) => {
    mockGetRoyalties.mockImplementation(async (contract: string) => {
      const matched = testCollectionRoyalties.find((c) => c.collection === contract);
      return matched?.data ?? [];
    });

    const { fillEvents } = await getFillEventsFromTx(txHash);
    const cache: StateCache = {
      royalties: new Map(),
    };

    for (let index = 0; index < fillEvents.length; index++) {
      const fillEvent = fillEvents[index];
      const feeForPlatform = platformFees.find((_) => _.kind === fillEvent.orderKind);
      const fees = await extractRoyalties(fillEvent, cache);

      const matched = testCollectionRoyalties.find((c) => c.collection === fillEvent.contract);

      if (matched) {
        expect(fees?.royaltyFeeBps).toEqual(matched.data[0].bps);
      }

      if (feeForPlatform) {
        // check
        expect(fees?.marketplaceFeeBps).toEqual(feeForPlatform.feeBps);
      }
    }
  };

  const txIds: TestCase[] = [
    {
      name: "reservoir-router-with-normalize",
      tx: "0xc422678f7e2c0efc8e140debed5a5f6a3f8061bb0ff02b701046876ff81dbe35",
    },
    // {
    //   name: "reservoir-router-with-normalize-missing-royalties",
    //   tx: "0x8b18a4ae5893905f3d877594e662190d34b8cc36b3626335e686ef6281f35c08",
    // },
  ];

  for (const { name, tx } of txIds) {
    it(`${name}`, async () => testFeeExtract(tx));
  }
});
