import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import "@/jobs/index";
import { getEnhancedEventsFromTx } from "../utils/events";
import { getEventData } from "../../sync/events/data";

describe("Treasure Sales", () => {
  test("event-parsing", async () => {
    const testCases = [
      {
        name: "bid",
        tx: "0x789f754ffdb9dfb4d9eacec4ca854168b3d2921971ff9ff6103bc89a7d9aa17e",
      },
    ];

    for (let index = 0; index < testCases.length; index++) {
      const testCase = testCases[index];
      const events = await getEnhancedEventsFromTx(testCase.tx);
      //console.log(events);
      const eventData = getEventData(["looks-rare-v2-taker-bid"])[0];
      const { args } = eventData.abi.parseLog(events[1].log);
      // console.log(
      //   args["feeAmounts"].reduce((sum: string, current: string) => sum + parseInt(current), 0)
      // );
      const maker = args["bidder"].toLowerCase();
      expect(maker).not.toBe(null);
    }
  });
});
