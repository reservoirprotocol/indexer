import { getEventData } from "@/events-sync/data";
import { processEventsBatch } from "@/events-sync/handlers";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { extractEventsBatches } from "@/events-sync/index";
import { concat } from "@/common/utils";
import * as es from "@/events-sync/storage";
import { Log } from "@ethersproject/abstract-provider";
import { PartialFillEvent } from "@/events-sync/handlers/royalties";

export const getEventParams = (log: Log, timestamp: number) => {
  const address = log.address.toLowerCase() as string;
  const block = log.blockNumber as number;
  const blockHash = log.blockHash.toLowerCase() as string;
  const txHash = log.transactionHash.toLowerCase() as string;
  const txIndex = log.transactionIndex as number;
  const logIndex = log.logIndex as number;

  return {
    address,
    txHash,
    txIndex,
    block,
    blockHash,
    logIndex,
    timestamp,
    batchIndex: 1,
  };
};

export const getEnhancedEventsFromTx = async (txHash: string) => {
  const enhancedEvents: EnhancedEvent[] = [];

  const availableEventData = getEventData();
  const tx = await utils.fetchTransaction(txHash);
  const { logs } = await utils.fetchTransactionLogs(txHash);

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const eventData = availableEventData.find(
      ({ addresses, topic, numTopics }) =>
        log.topics[0] === topic &&
        log.topics.length === numTopics &&
        (addresses ? addresses[log.address.toLowerCase()] : true)
    );
    if (eventData) {
      enhancedEvents.push({
        kind: eventData.kind,
        subKind: eventData.subKind,
        baseEventParams: getEventParams(log, tx.blockTimestamp),
        log,
      });
    }
  }

  return enhancedEvents;
};

export async function extractOnChainData(enhancedEvents: EnhancedEvent[]) {
  const allOnChainData: OnChainData[] = [];

  const eventBatches = await extractEventsBatches(enhancedEvents, true);
  for (const batch of eventBatches) {
    const onChainData = await processEventsBatch(batch, true);
    allOnChainData.push(onChainData);
  }

  return allOnChainData;
}

export async function getFillEventsFromTx(txHash: string) {
  const events = await getEnhancedEventsFromTx(txHash);
  const allOnChainData = await extractOnChainData(events);

  let fillEvents: es.fills.Event[] = [];
  for (let i = 0; i < allOnChainData.length; i++) {
    const data = allOnChainData[i];
    const allEvents = concat(
      data.fillEvents,
      data.fillEventsPartial,
      data.fillEventsOnChain
    ).filter((e) => e.orderKind !== "mint");
    fillEvents = [...fillEvents, ...allEvents];
  }

  return {
    events,
    fillEvents,
  };
}

export async function getFillEventsFromTxOnChain(txHash: string) {
  const events = await getEnhancedEventsFromTx(txHash);
  const allOnChainData = await extractOnChainData(events);

  let fillEvents: PartialFillEvent[] = [];
  for (let i = 0; i < allOnChainData.length; i++) {
    const data = allOnChainData[i];
    const allEvents = concat(
      data.fillEvents,
      data.fillEventsPartial,
      data.fillEventsOnChain
    ).filter((e) => e.orderKind !== "mint");
    fillEvents = [...fillEvents, ...allEvents];
  }

  return {
    events,
    fillEvents,
  };
}

export async function parseTranscation(txHash: string) {
  const events = await getEnhancedEventsFromTx(txHash);
  const allOnChainData = await extractOnChainData(events);
  return {
    events,
    allOnChainData,
  };
}
