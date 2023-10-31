import { config as dotEnvConfig } from "dotenv";
import allTx from "./__fixtures__/tx";
dotEnvConfig();
import "@/jobs/index";
import { getEnhancedEventsFromTx } from "../utils/events";
import { BigNumber } from "@ethersproject/bignumber";
import { getEventData } from "../../sync/events/data";

describe("Treasure Sales", () => {
  test("item-sold-indexing", async () => {
    //Start With Event parsing
    // Get Sales Tx
    const saleTx = allTx.saleTx;
    // Get Events from Tx
    const events = await getEnhancedEventsFromTx(saleTx);
    // Get Event Data
    const eventData = getEventData(["treasure-item-sold"])[0];
    // First Event
    const { args } = eventData.abi.parseLog(events[1].log);
    //
    const tokenId = args["tokenId"];
    const quantity = args["quantity"];
    const pricePerItem = args["pricePerItem"];
    expect(tokenId).toEqual(BigNumber.from(1));
    expect(quantity).toEqual(BigNumber.from(3));
    expect(pricePerItem).toEqual(BigNumber.from("108000000000000000000"));
  });
});
