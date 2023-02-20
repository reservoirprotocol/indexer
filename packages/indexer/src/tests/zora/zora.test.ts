import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
// import { baseProvider } from "@/common/provider";
// import allTx from "./__fixtures__/tx";
// import { idb } from "@/common/db";
// import { getEventsFromTx, wait } from "../utils/test";
// import { handleEvents } from "@/events-sync/handlers/zora";
// import { processOnChainData } from "@/events-sync/handlers/utils";
// import { keccak256 } from "@ethersproject/solidity";

describe("ZoraExchange", () => {
  test("order", async () => {
    // const tx = await baseProvider.getTransactionReceipt(allTx.createAskTx);
    // const events = await getEventsFromTx(tx);
    // const result = await handleEvents(events);
    // expect(result.orders?.length).toEqual(1);
  });

  test("order-save-cancel", async () => {
    // const groupCreateTx = await baseProvider.getTransactionReceipt(allTx.cancelAskCreateTx);
    // const cancelAsk = await baseProvider.getTransactionReceipt(allTx.cancelAskTx);
    // const createEvents = await getEventsFromTx(groupCreateTx);
    // const cancelEvents = await getEventsFromTx(cancelAsk);
    // const createResult = await handleEvents(createEvents);
    // const cancelAskResult = await handleEvents(cancelEvents);
    // // if (createResult.orders?.length) console.log(createResult.orders[0])
    // // console.log(cancelAskResult.cancelEventsOnChain)
    // await processOnChainData(createResult);
    // await wait(10 * 1000);
    // await processOnChainData(cancelAskResult);
    // await wait(10 * 1000);
    // const orderId = keccak256(
    //   ["string", "string", "uint256"],
    //   ["zora-v3", "0x2E6847e41c1193FE9528FA53c50e16C9fD082219", "3"]
    // );
    // const [order, cancelExist] = await Promise.all([
    //   idb.oneOrNone(`SELECT fillability_status FROM "orders" "o" WHERE "o"."id" = $/id/`, {
    //     id: orderId,
    //   }),
    //   idb.oneOrNone(`SELECT 1 FROM "cancel_events" "o" WHERE "o"."order_id" = $/id/`, {
    //     id: orderId,
    //   }),
    // ]);
    // expect(order?.fillability_status).toEqual("cancelled");
    // expect(!!cancelExist).toEqual(true);
  });

  test("order-update", async () => {
    // const setAskCreateTx = await baseProvider.getTransactionReceipt(allTx.setAskCreateTx);
    // const setAskTx = await baseProvider.getTransactionReceipt(allTx.setAskTx);
    // const eventsCreate = await getEventsFromTx(setAskCreateTx);
    // const eventsSet = await getEventsFromTx(setAskTx);
    // const result1 = await handleEvents(eventsCreate);
    // const result2 = await handleEvents(eventsSet);
    // await processOnChainData(result1);
    // await wait(10 * 1000);
    // await processOnChainData(result2);
    // await wait(10 * 1000);
    // const orderId = keccak256(
    //   ["string", "string", "uint256"],
    //   ["zora-v3", "0xabEFBc9fD2F806065b4f3C237d4b59D9A97Bcac7", "10042"]
    // );
    // const order = await idb.oneOrNone(`SELECT price FROM "orders" "o" WHERE "o"."id" = $/id/`, {
    //   id: orderId,
    // });
    // // after update
    // expect(order?.price).toEqual("990000000000000000");
  });
});
