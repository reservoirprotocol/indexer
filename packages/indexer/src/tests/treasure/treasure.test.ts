import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { getEnhancedEventsFromTx } from "../utils/events";
import { getEventData } from "../../sync/events/data";

describe("Treasure Sales", () => {
  test("event-parsing", async () => {
    const testCases = [
      {
        name: "bid",
        tx: "0x9c7363e882515a4826cec9a80e73aea9980b90d8445c417166dd66511d633ace",
      },
    ];

    for (let index = 0; index < testCases.length; index++) {
      const testCase = testCases[index];
      const events = await getEnhancedEventsFromTx(testCase.tx);
      const eventData = getEventData(["treasure-bid-accepted"])[0];
      const { args } = eventData.abi.parseLog(events[1].log);
      const maker = args["bidder"].toLowerCase();
      expect(maker).not.toBe(null);
    }
  });
});
