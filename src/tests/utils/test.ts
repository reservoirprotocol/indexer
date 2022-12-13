import { EnhancedEvent } from "@/events-sync/handlers/utils";
import { getEventData } from "@/events-sync/data";
import { TransactionReceipt, Log, Block } from "@ethersproject/abstract-provider";
import { baseProvider } from "@/common/provider";
import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";

export async function saveContract(address: string, kind: string) {
  const columns = new pgp.helpers.ColumnSet(["address", "kind"], {
    table: "contracts",
  });
  const queries = [
    `
  INSERT INTO "contracts" (
    "address",
    "kind"
  ) VALUES ${pgp.helpers.values(
    {
      address: toBuffer(address),
      kind,
    },
    columns
  )}
  ON CONFLICT DO NOTHING
`,
  ];
  await idb.none(pgp.helpers.concat(queries));
}

export function getEventParams(log: Log, blockResult: Block) {
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
    timestamp: blockResult.timestamp,
    batchIndex: 1,
  };
}

export async function getEventsFromTx(tx: TransactionReceipt) {
  const enhancedEvents: EnhancedEvent[] = [];
  const availableEventData = getEventData();
  const blockResult = await baseProvider.getBlock(tx.blockNumber);
  for (let index = 0; index < tx.logs.length; index++) {
    const log = tx.logs[index];
    const eventData = availableEventData.find(
      ({ addresses, topic, numTopics }) =>
        log.topics[0] === topic &&
        log.topics.length === numTopics &&
        (addresses ? addresses[log.address.toLowerCase()] : true)
    );
    if (eventData) {
      enhancedEvents.push({
        kind: eventData.kind,
        baseEventParams: getEventParams(log, blockResult),
        log,
      });
    }
  }
  return enhancedEvents;
}

export function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
