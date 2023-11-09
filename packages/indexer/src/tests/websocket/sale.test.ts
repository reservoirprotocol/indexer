/* eslint-disable @typescript-eslint/no-unused-vars,@typescript-eslint/no-empty-function */

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { jest, describe, it, expect } from "@jest/globals";
import {
  SaleWebsocketEventsTriggerQueueJob,
  SaleWebsocketEventsTriggerQueueJobPayload,
} from "@/jobs/websocket-events/sale-websocket-events-trigger-job";

import { getTokenMetadata } from "@/jobs/websocket-events/utils";
import { getCurrency } from "@/utils/currencies";
import { publishWebsocketEvent, WebsocketMessage } from "@/common/websocketPublisher";
import { JoiSale } from "@/common/joi";

import payload from "./__fixtures__/sale/payload-before-empty.json";

jest.setTimeout(1000 * 1000);

const mockGetTokenMetadata = getTokenMetadata as jest.MockedFunction<typeof getTokenMetadata>;
const mockGetCurrency = getCurrency as jest.MockedFunction<typeof getCurrency>;
const mockPublishWebsocketEvent = publishWebsocketEvent as jest.MockedFunction<
  typeof publishWebsocketEvent
>;

jest.setTimeout(1000 * 1000);
jest.mock("@/jobs/websocket-events/utils");
jest.mock("@/utils/currencies");
jest.mock("@/common/websocketPublisher");

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

    const publishWebsocketEvent = mockPublishWebsocketEvent.mockImplementation(
      async (message: WebsocketMessage) => {}
    );

    const queue = new SaleWebsocketEventsTriggerQueueJob();
    await queue.process({
      data: payload,
    } as unknown as SaleWebsocketEventsTriggerQueueJobPayload);

    // make sure the `publishWebsocketEvent` is callled
    expect(publishWebsocketEvent.mock.calls).toHaveLength(1);

    const message = publishWebsocketEvent.mock.calls[0]![0]!;

    // check the schema
    expect(JoiSale.validate(message!.data).error).toBe(undefined);

    // check the result
    expect(publishWebsocketEvent).toBeCalledWith(
      expect.objectContaining({
        event: "sale.created",
        tags: {
          contract: "0x4e76c23fe2a4e37b5e07b5625e17098baab86c18",
          maker: "0xd805cec34482ee455144dd04aad09f2758cddfe8",
          taker: "0x98415e65216c83910f82f663dc152a535c0428b5",
        },
        changed: [],
        data: {
          id: "77b69785b7310c10cade9353def2266b14f45f8cac6cf130cc40759d8ab89223",
          token: {
            contract: "0x4e76c23fe2a4e37b5e07b5625e17098baab86c18",
            tokenId: "11847",
            name: null,
            image: null,
            collection: {
              id: null,
              name: null,
            },
          },
          orderId: "0xdce19dfc31c2f21c4e64a092911ed5b6013ed50ee9c68d7d34521f9cecc49651",
          orderSource: null,
          orderSide: "bid",
          orderKind: "blur-v2",
          from: "0x98415e65216c83910f82f663dc152a535c0428b5",
          to: "0xd805cec34482ee455144dd04aad09f2758cddfe8",
          amount: "1",
          fillSource: null,
          block: 18420499,
          txHash: "0x333a3cefe0c89c7605fb0952a56b311206e031174d3708207fb889c06d958890",
          logIndex: 390,
          batchIndex: 1,
          timestamp: 1698155111,
          price: {
            currency: {
              contract: "0x0000000000000000000000000000000000000000",
              name: "WETH",
              symbol: "WETH",
              decimals: 18,
            },
            amount: {
              raw: "50000000000000000",
              decimal: 0.05,
              usd: 88.24652,
              native: 0.05,
            },
          },
          washTradingScore: 0,
          feeBreakdown: [],
          createdAt: "2023-10-24T13:45:13.478Z",
          updatedAt: "2023-10-24T13:45:13.478Z",
        },
      })
    );
  });
});
