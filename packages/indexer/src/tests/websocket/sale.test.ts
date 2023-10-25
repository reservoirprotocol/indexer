import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { jest, describe, it, expect } from "@jest/globals";
import {
  SaleWebsocketEventsTriggerQueueJob,
  SaleWebsocketEventsTriggerQueueJobPayload,
} from "@/jobs/websocket-events/sale-websocket-events-trigger-job";

import { getTokenMetadata } from "@/jobs/websocket-events/utils";
import { getCurrency } from "@/utils/currencies";
// import { fromBuffer } from "@/common/utils";
import { JoiSale } from "@/common/joi";

import payload from "./__fixtures__/sale/payload-before-empty.json";

jest.setTimeout(1000 * 1000);

const mockGetTokenMetadata = getTokenMetadata as jest.MockedFunction<typeof getTokenMetadata>;
const mockGetCurrency = getCurrency as jest.MockedFunction<typeof getCurrency>;

jest.setTimeout(1000 * 1000);
jest.mock("@/jobs/websocket-events/utils");
jest.mock("@/utils/currencies");

describe("Websocket - Sales", () => {
  it("message-schema-validation", async () => {
    mockGetTokenMetadata.mockImplementation(async () =>
      // tokenId: string, contract: string
      {
        return {};
      }
    );

    mockGetCurrency.mockImplementation(async (currency: string) => {
      return {
        contract: currency,
        name: "WETH",
        symbol: "WETH",
        decimals: 18,
        metadata: {},
      };
    });

    // function fixBase64(payload: any) {
    //   for (const key in payload) {
    //     const value = (payload as any)[key];
    //     if (typeof value === "string" && value.includes("=")) {
    //       (payload as any)[key] = fromBuffer(Buffer.from(value, "base64"));
    //     } else if (value !== null && typeof value === "object") {
    //       fixBase64(payload[key]);
    //     }
    //   }
    // }
    // fixBase64(payload);

    const message = await SaleWebsocketEventsTriggerQueueJob.format({
      data: payload,
    } as unknown as SaleWebsocketEventsTriggerQueueJobPayload);

    const status = JoiSale.validate(message!.data);

    expect(status.error).toBe(undefined);
    expect(message!.event).toBe("sale.created");
    expect(message!.tags.contract).toBe("0x4e76c23fe2a4e37b5e07b5625e17098baab86c18");
    expect(message!.tags.maker).toBe("0xd805cec34482ee455144dd04aad09f2758cddfe8");
    expect(message!.tags.taker).toBe("0x98415e65216c83910f82f663dc152a535c0428b5");
  });
});
