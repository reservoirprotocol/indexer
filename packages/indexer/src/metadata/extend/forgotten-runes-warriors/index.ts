/* eslint-disable @typescript-eslint/no-explicit-any */

import { TokenMetadata } from "@/metadata/types";

import _warriors from "./warriors.json";

const warriors: {
  [key: string]: {
    [key: string]: string;
  };
} = _warriors;
const rank = {
  Head: 14,
  Body: 13,
  Companion: 12,
  Weapon: 11,
  Shield: 10,
  Rune: 9,
  Background: 8,
  Affinity: 7,
  "% Traits in Affinity": 6,
  "# Traits in Affinity": 5,
  "# Traits": 4,
  Name: 3,
  Title: 2,
  Affiliation: 1,
};

export const extend = async (metadata: TokenMetadata) => {
  const rankCopy = JSON.parse(JSON.stringify(rank));
  const attributes: any[] = [];

  metadata.attributes.forEach((attribute: any) => {
    const attributeKey = attribute.key.charAt(0).toUpperCase() + attribute.key.slice(1);
    attributes.push({
      key: attributeKey ?? "property",
      rank: rank[attributeKey as keyof typeof rank]
        ? rank[attributeKey as keyof typeof rank]
        : null,
      value: attribute.value,
      kind: "string",
    });

    delete rankCopy[attributeKey];
  });

  // Add Name attributes
  for (const attribute of ["Name", "Title", "Affiliation"]) {
    const warrior = warriors[metadata.tokenId as keyof typeof warriors];
    attributes.push({
      key: attribute ?? "property",
      rank: rankCopy[attribute] ? rankCopy[attribute] : null,
      value: warrior[attribute as keyof typeof warriors],
      kind: "string",
    });

    delete rankCopy[attribute];
  }

  // Add 'None' value for missing attributes
  for (const attribute of Object.keys(rankCopy)) {
    attributes.push({
      key: attribute ?? "property",
      rank: rankCopy[attribute] ? rankCopy[attribute] : null,
      value: "None",
      kind: "string",
    });
  }

  return {
    ...metadata,
    attributes,
  };
};
