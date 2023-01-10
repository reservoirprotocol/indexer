import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { config } from "@/config/index";
import { baseProvider } from "@/common/provider";

import { handleEvents } from "@/events-sync/handlers/infinity";
import { getEventsFromTx } from "tests/utils/test";

describe("Infinity", () => {
  if (config.chainId !== 1) {
    throw new Error("Chain ID must be 1");
  }

  test("takeOrderFulfilled", async () => {
    const tx = await baseProvider.getTransactionReceipt(
      "0x7928a57e9612595b4c9179298454874d94cde3b7c999c71a8cda3da2ecdd22d9"
    );
    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);
    expect(result.orderInfos?.length).toEqual(1);
  });

  test("matchOrderFulfilled", async () => {
    const tx = await baseProvider.getTransactionReceipt(
      "0x2ef5f356594291a75e87526255e81fe470bf089fa695b6ad2c598ec8a57b06d6"
    );

    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);
    expect(result.orderInfos?.length).toEqual(2);
  });

  test("cancelMultipleOrders", async () => {
    const tx = await baseProvider.getTransactionReceipt(
      "0xa7ce82c2102369d68f4056b18122869504c359b5920f97eec255599286452100"
    );

    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);

    expect(result.nonceCancelEvents?.length).toEqual(1);
    expect(result.nonceCancelEvents?.[0]?.nonce).toEqual("18");
  });

  test("cancelAllOrders", async () => {
    const tx = await baseProvider.getTransactionReceipt(
      "0x63dbcf5609a85b13b6c1dfd88bc1acef9df8ae981e9d3044d3812e874f7fdd33"
    );

    const events = await getEventsFromTx(tx);
    const result = await handleEvents(events);

    expect(result.bulkCancelEvents?.length).toEqual(1);
    expect(result.bulkCancelEvents?.[0]?.minNonce).toEqual("10");
  });
});
