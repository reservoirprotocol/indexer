/* eslint-disable @typescript-eslint/no-explicit-any */

import { TokenMetadata } from "@/metadata/types";

import _wizards from "./wizards.json";

const wizards: {
  [key: string]: {
    [key: string]: string;
  };
} = _wizards as any;

const rank = {
  Head: 14,
  Body: 13,
  Familiar: 12,
  Prop: 11,
  Rune: 10,
  Background: 9,
  Affinity: 8,
  "% Traits in Affinity": 7,
  "# Traits in Affinity": 6,
  "# Traits": 5,
  Title: 4,
  Name: 3,
  Origin: 2,
};

export const extend = async (metadata: TokenMetadata) => {
  const attributes: any[] = [];
  for (const trait of Object.keys(rank)) {
    attributes.push({
      key: trait ?? "property",
      rank: rank[trait as keyof typeof rank],
      value: wizards[metadata.tokenId as keyof typeof wizards][trait as keyof typeof wizards],
      kind: "string",
    });
  }

  return {
    ...metadata,
    attributes,
  };
};
