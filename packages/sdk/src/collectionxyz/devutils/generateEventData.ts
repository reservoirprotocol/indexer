import { EventFragment, Interface, ParamType, keccak256, toUtf8Bytes } from "ethers/lib/utils";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

// This script gets event formats etc for event subkinds from pool and factory
// and generates packages/indexer/src/sync/events/data/collectionxyz.ts

// Steps to use:
//    1. Make sure you run generateABIs.py
//    2. Copy all collectionxyz event subkinds from the EventSubKind type definition
//    3. Run this script from root directory of the repo using yarn ts-node <path-to-script>/generateEventData.ts

const ALL_EVENT_SUBKINDS = [
  "collectionxyz-new-pool",
  "collectionxyz-token-deposit",
  "collectionxyz-token-withdrawal",
  "collectionxyz-nft-deposit",
  "collectionxyz-nft-withdrawal",
  "collectionxyz-accrued-trade-fee-withdrawal",
  "collectionxyz-accepts-token-ids",
  "collectionxyz-swap-nft-in-pool",
  "collectionxyz-swap-nft-out-pool",
  "collectionxyz-spot-price-update",
  "collectionxyz-delta-update",
  "collectionxyz-props-update",
  "collectionxyz-state-update",
  "collectionxyz-royalty-numerator-update",
  "collectionxyz-royalty-recipient-fallback-update",
  "collectionxyz-external-filter-set",
  "collectionxyz-fee-update",
  "collectionxyz-protocol-fee-multiplier-update",
  "collectionxyz-carry-fee-multiplier-update",
  "collectionxyz-asset-recipient-change",
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

function formatParamType(param: ParamType): string {
  let type;
  if (param.baseType === "array") {
    type = `${formatParamType(param.arrayChildren)}[]`;
  } else if (param.baseType === "tuple") {
    type = `tuple(${param.components.map(formatParamType).join(", ")})`;
  } else {
    type = param.type;
  }
  return `${type}${param.indexed ? " indexed" : ""}${param.name ? " " + param.name : ""}`;
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
  kind: "collectionxyz",
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
${eventFragment.inputs.map((input) => `      ${formatParamType(input)}`).join(",\n")}
    )\`,
  ]),
};`;
}).join("\n\n");

// Write to output file
const eventDataFileName = path.resolve(
  __dirname + "/../../../../indexer/src/sync/events/data/collectionxyz.ts"
);
writeFileSync(
  eventDataFileName,
  `import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";` +
    "\n\n" +
    eventDataToExport +
    "\n"
);
