import { EventFragment, Interface, keccak256, toUtf8Bytes } from "ethers/lib/utils";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

// This script gets event formats etc for event subkinds from pool and factory
// and generates packages/indexer/src/sync/events/data/collection.ts

// Steps to use:
//    1. Make sure you run generateABIs.py
//    2. Copy all collection event subkinds from the EventSubKind type definition
//    3. Run this script from root directory of the repo using yarn ts-node <path-to-script>/generateEventData.ts

const ALL_EVENT_SUBKINDS = [
  "collection-new-pool",
  "collection-token-deposit",
  "collection-token-withdrawal",
  "collection-nft-deposit",
  "collection-nft-withdrawal",
  "collection-accrued-trade-fee-withdrawal",
  "collection-accepts-token-ids",
  "collection-swap-nft-in-pool",
  "collection-swap-nft-out-pool",
  "collection-spot-price-update",
  "collection-delta-update",
  "collection-props-update",
  "collection-state-update",
  "collection-royalty-numerator-update",
  "collection-royalty-recipient-fallback-update",
  "collection-external-filter-set",
  "collection-fee-update",
  "collection-protocol-fee-multiplier-update",
  "collection-carry-fee-multiplier-update",
  "collection-asset-recipient-change",
];

function subKindToEventName(subKindName: string): string {
  const tokens = subKindName.split("-").slice(1, undefined);
  return (
    tokens
      // Handle the non camelcase events (IDs, NFT)
      .map((token) => token.replace("id", "ID").replace("nft", "NFT"))
      .map((token) => token.charAt(0).toUpperCase().concat(token.slice(1, undefined)))
      .join("")
  );
}

const factoryAbi = JSON.parse(
  readFileSync(__dirname + "/../abis/CollectionPoolFactory.json").toString()
);
const factoryIface = new Interface(factoryAbi);
const factoryEventFragments = Object.values(factoryIface.events).filter(
  // Don't get the duplicate tokendeposit event in factory
  (event) => event.name !== "TokenDeposit"
);

const poolAbi = JSON.parse(readFileSync(__dirname + "/../abis/CollectionPool.json").toString());
const poolIface = new Interface(poolAbi);

const eventNameToFragment = new Map<string, EventFragment>(
  Object.values(poolIface.events)
    .concat(factoryEventFragments)
    .map((frag) => [frag.name, frag])
);

const eventDataToExport = ALL_EVENT_SUBKINDS.map((subKindName) => {
  const eventName = subKindToEventName(subKindName);
  const eventFragment = eventNameToFragment.get(eventName)!;
  if (!eventFragment) throw new Error(`Couldnt find event fragment for ${subKindName}`);
  const tokens = subKindName.split("-").slice(1, undefined);
  const eventType = [tokens[0]]
    .concat(
      tokens
        .slice(1, undefined)
        .map((token) =>
          token.charAt(0).toUpperCase().concat(token.slice(1, undefined).toLowerCase())
        )
    )
    .join("");
  return `export const ${eventType}: EventData = {
  kind: "collection",
  subKind: "${subKindName}",
  topic: "${keccak256(toUtf8Bytes(eventFragment.format()))}",
  numTopics: ${
    1 +
    eventFragment.inputs
      .map((input) => (input.indexed ? 1 : 0))
      .reduce((acc: number, val: number) => acc + val, 0)
  },
  abi: new Interface([
    \`event ${eventFragment.name}(
${eventFragment.inputs.map((input) => `      ${input.type} ${input.name}`).join(",\n")}
    )\`,
  ]),
};`;
}).join("\n\n");

// Write to output file
const eventDataFileName = path.resolve(
  __dirname + "/../../../../indexer/src/sync/events/data/collection.ts"
);
writeFileSync(
  eventDataFileName,
  `import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";` +
    "\n\n" +
    eventDataToExport +
    "\n"
);
