import { Filter, Log } from "@ethersproject/abstract-provider";

import { baseProvider } from "@/common/provider";
import { concat } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import { EventsBatch, processEventsBatch } from "@/events-sync/handlers";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { PartialFillEvent } from "@/events-sync/handlers/royalties";
import { extractEventsBatches } from "@/events-sync/index";
import { parseEvent } from "@/events-sync/parser";
import * as utils from "@/events-sync/utils";
import * as es from "@/events-sync/storage";
import * as syncEvents from "@/events-sync/index";
import * as syncEventsUtils from "@/events-sync/utils";

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

export async function extractOnChainData(enhancedEvents: EnhancedEvent[], skipProcessing = true) {
  const allOnChainData: OnChainData[] = [];
  const eventBatches = await extractEventsBatches(enhancedEvents);
  for (const batch of eventBatches) {
    const onChainData = await processEventsBatch(batch, skipProcessing);
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

export const parseTransaction = async (txHash: string) => {
  const events = await getEnhancedEventsFromTx(txHash);
  const allOnChainData = await extractOnChainData(events);
  return {
    events,
    allOnChainData,
  };
};

export const parseBlock = async (block: number) => {
  const blockData = await syncEventsUtils.fetchBlock(block);
  const eventFilter: Filter = {
    topics: [[...new Set(getEventData().map(({ topic }) => topic))]],
    fromBlock: block,
    toBlock: block,
  };

  const availableEventData = getEventData();

  // Get the logs from the RPC
  const logs = await baseProvider.getLogs(eventFilter);

  let enhancedEvents = logs
    .map((log) => {
      const baseEventParams = parseEvent(log, blockData.timestamp);
      return availableEventData
        .filter(
          ({ addresses, numTopics, topic }) =>
            log.topics[0] === topic &&
            log.topics.length === numTopics &&
            (addresses ? addresses[log.address.toLowerCase()] : true)
        )
        .map((eventData) => ({
          kind: eventData.kind,
          subKind: eventData.subKind,
          baseEventParams,
          log,
        }));
    })
    .flat();

  enhancedEvents = enhancedEvents.filter((e) => e) as EnhancedEvent[];

  const eventsBatches = syncEvents.extractEventsBatches(enhancedEvents as EnhancedEvent[]);

  const allOnChainData: {
    batch: EventsBatch;
    onChainData: OnChainData;
  }[] = [];
  for (const batch of eventsBatches) {
    const onChainData = await processEventsBatch(batch, true);
    allOnChainData.push({
      batch,
      onChainData,
    });
  }

  return allOnChainData;
};
