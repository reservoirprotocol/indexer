import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { baseProvider } from "@/common/provider";
import { getEventsFromTx } from "../utils/test";
import * as blur from "@/events-sync/handlers/blur";
import { extractRoyalties } from "@/events-sync/handlers/royalties/blur";

jest.setTimeout(1000 * 1000);

describe("Royalties - Blur", () => {
  const TEST_COLLECTION = "0x33c6eec1723b12c46732f7ab41398de45641fa42";

  const testFeeExtract = async (txHash: string) => {
    const tx = await baseProvider.getTransactionReceipt(txHash);
    const events = await getEventsFromTx(tx);
    const result = await blur.handleEvents(events);
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
    ["single sale", "0xb79639640d8cfe44decc069eb8d7a22f20776557e69f9e3ea3de5c86d9adf181"],
    // [
    //   "multiple sales with different protocols(x2y2+seaport)",
    //   "0xa451be1bd9edef5cab318e3cb0fbff6a6f9955dfd49e484caa37dbaa6982a1ed",
    // ],
    // [
    //   "multiple sales with different collections",
    //   "0xfef549999f91e499dc22ad3d635fd05949d1a7fda1f7c5827986f23fc341f828",
    // ],
    // [
    //   "multiple sales with same collection",
    //   "0x28cb9371d6d986a00e19797270c542ad6901abec7b67bbef7b2ae947b3c37c0b",
    // ],
  ];

  for (const [name, txHash] of txIds) {
    it(`${name}`, async () => testFeeExtract(txHash));
  }
});
