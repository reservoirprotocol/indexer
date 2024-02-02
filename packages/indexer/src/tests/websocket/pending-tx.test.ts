/* eslint-disable @typescript-eslint/no-unused-vars,@typescript-eslint/no-empty-function */

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { jest, describe, it, expect } from "@jest/globals";
import {
  PendingTxWebsocketEventsTriggerQueueJobPayload,
  pendingTxWebsocketEventsTriggerQueueJob,
} from "@/jobs/websocket-events/pending-tx-websocket-events-trigger-job";

import { getTokenMetadata } from "@/jobs/websocket-events/utils";
import { getCurrency } from "@/utils/currencies";
import { publishWebsocketEvent, WebsocketMessage } from "@/common/websocketPublisher";

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

describe("Websocket - PendingTx", () => {
  it("create", async () => {
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

    await pendingTxWebsocketEventsTriggerQueueJob.process({
      data: {
        trigger: "created",
        item: {
          contract: "0x80336ad7a747236ef41f47ed2c7641828a480baa",
          tokenId: "1859",
          txHash: "0x23fec2c2100cacb7a9269e69369e64da4763922825f6a800a9684ec455bead05",
        },
      },
    } as unknown as PendingTxWebsocketEventsTriggerQueueJobPayload);

    // make sure the `publishWebsocketEvent` is callled
    expect(publishWebsocketEvent.mock.calls).toHaveLength(1);

    // const message = publishWebsocketEvent.mock.calls[0]![0]!;

    // check the result
    expect(publishWebsocketEvent).toBeCalledWith(
      expect.objectContaining({
        event: "pending-tx.created",
        tags: { contract: "0x80336ad7a747236ef41f47ed2c7641828a480baa" },
        changed: [],
        data: {
          contract: "0x80336ad7a747236ef41f47ed2c7641828a480baa",
          tokenId: "1859",
          txHash: "0x23fec2c2100cacb7a9269e69369e64da4763922825f6a800a9684ec455bead05",
        },
      })
    );
  });

  it("delete", async () => {
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

    await pendingTxWebsocketEventsTriggerQueueJob.process({
      data: {
        trigger: "deleted",
        item: {
          contract: "0x80336ad7a747236ef41f47ed2c7641828a480baa",
          tokenId: "1859",
          txHash: "0x23fec2c2100cacb7a9269e69369e64da4763922825f6a800a9684ec455bead05",
        },
      },
    } as unknown as PendingTxWebsocketEventsTriggerQueueJobPayload);

    // make sure the `publishWebsocketEvent` is callled
    expect(publishWebsocketEvent.mock.calls).toHaveLength(1);

    // const message = publishWebsocketEvent.mock.calls[0]![0]!;

    // check the result
    expect(publishWebsocketEvent).toBeCalledWith(
      expect.objectContaining({
        event: "pending-tx.deleted",
        tags: { contract: "0x80336ad7a747236ef41f47ed2c7641828a480baa" },
        changed: [],
        data: {
          contract: "0x80336ad7a747236ef41f47ed2c7641828a480baa",
          tokenId: "1859",
          txHash: "0x23fec2c2100cacb7a9269e69369e64da4763922825f6a800a9684ec455bead05",
        },
      })
    );
  });
});
