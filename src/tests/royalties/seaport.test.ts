import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { baseProvider } from "@/common/provider";
import { getEventsFromTx } from "../utils/test";
import * as seaport from "@/events-sync/handlers/seaport";
import { extractRoyalties } from "@/events-sync/handlers/royalties/core";
import { getRoyalties } from "@/utils/royalties";

jest.setTimeout(1000 * 1000);

jest.mock("@/utils/royalties");
const mockGetRoyalties = getRoyalties as jest.MockedFunction<typeof getRoyalties>;

describe("Royalties - Seaport", () => {
  const TEST_COLLECTION = "0x33c6eec1723b12c46732f7ab41398de45641fa42";

  const testFeeExtract = async (txHash: string) => {
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

    const tx = await baseProvider.getTransactionReceipt(txHash);
    const events = await getEventsFromTx(tx);
    const result = await seaport.handleEvents(events);
    const fillEvents = result.fillEventsPartial ?? [];
    for (let index = 0; index < fillEvents.length; index++) {
      const fillEvent = fillEvents[index];
      const fees = await extractRoyalties(fillEvent);
      if (fees?.sale.contract === TEST_COLLECTION) {
        expect(fees?.royaltyFeeBps).toEqual(750);
      }
      expect(fees?.marketplaceFeeBps).toEqual(250);
    }
  };

  const txIds = [
    ["single sale", "0x93de26bea65832e10c253f6cd0bf963619d7aef63695b485d9df118dd6bd4ae4"],
    [
      "multiple sales with different protocols(x2y2+seaport)",
      "0xa451be1bd9edef5cab318e3cb0fbff6a6f9955dfd49e484caa37dbaa6982a1ed",
    ],
    [
      "multiple sales with different collections",
      "0xfef549999f91e499dc22ad3d635fd05949d1a7fda1f7c5827986f23fc341f828",
    ],
    [
      "multiple sales with same collection",
      "0x28cb9371d6d986a00e19797270c542ad6901abec7b67bbef7b2ae947b3c37c0b",
    ],
    ["test", "0x60355582e37bab762807c3066ada4e79cc6432a745551f06ae8c534650aecca7"],
  ];

  for (const [name, txHash] of txIds) {
    it(`${name}`, async () => testFeeExtract(txHash));
  }
});
