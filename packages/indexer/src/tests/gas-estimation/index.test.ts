import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { jest, describe, it, expect } from "@jest/globals";
import { getTotalEstimateGas } from "../../utils/gas-estimation";
import { TxAttributeKind } from "@reservoir0x/sdk/dist/router/v6/types";

jest.setTimeout(1000 * 1000);

describe("Gas Estimation", () => {
  it("compute", async () => {
    const testTranscations = [
      {
        txTags: {
          kind: "sale" as TxAttributeKind,
          listings: [
            { protocol: "seaport", count: 2 },
            { protocol: "seaport-v1.4", count: 1 },
          ],
          feesOnTop: 3,
          swaps: 1,
        },
        txData: {
          from: "0x5124fcC2B3F99F571AD67D075643C743F38f1C34",
          to: "0xe688b84b23f322a994A53dbF8E15FA82CDB71127",
          data: "0x",
        },
      },
      {
        txTags: {
          kind: "sale" as TxAttributeKind,
          bids: [
            { protocol: "seaport", count: 1 },
            { protocol: "seaport-v1.4", count: 1 },
          ],
          feesOnTop: 0,
        },
        txData: {
          from: "0x5124fcC2B3F99F571AD67D075643C743F38f1C34",
          to: "0xe688b84b23f322a994A53dbF8E15FA82CDB71127",
          data: "0x",
        },
      },
    ];
    const { totalEstimateGas } = await getTotalEstimateGas(testTranscations);
    expect(totalEstimateGas).toBe("1023179");
  });
});
