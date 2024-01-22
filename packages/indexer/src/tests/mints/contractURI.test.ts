import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { jest, describe, it, expect } from "@jest/globals";
import * as detector from "@/orderbook/mints/calldata/detector";

jest.setTimeout(1000 * 1000);

describe("contractURI mintConfig", () => {
  it("allows to detect from mintConfig", async () => {
    // @todo how to add "referral" kind keyword to mint?
    // @todo
    const contractURI = {
      mintConfig: {
        phases: [
          {
            startTime: 0,
            endTime: 0,
            tx: {
              method: "0x4a21a2df",
              params: [
                {
                  name: "phase",
                  abiType: "(bytes32,bytes32[])",
                  value: ["0x0000000000000000000000000000000000000000000000000000000000000000", []],
                },
                { kind: "QUANTITY", name: "quantity", abiType: "uint256" },
                {
                  kind: "REFERRAL",

                  name: "referral",
                  abiType: "address",
                },
                {
                  name: "proof",
                  abiType: "bytes",
                  value: "0x",
                },
              ],
            },
          },
        ],
      },
    };

    const collectionMints = await detector.extractByContractMetadata(
      "0x112423592fc313ef04a1c147a7ae3dadb99d7cdd",
      contractURI
    );

    expect(collectionMints.length).not.toBe(0);
  });
});
