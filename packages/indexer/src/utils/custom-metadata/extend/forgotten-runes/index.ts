/* eslint-disable @typescript-eslint/no-explicit-any */

import wizards from "./wizards.json";

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

export const extend = async (_chainId: number, metadata: any) => {
  const attributes: any[] = [];
  for (const trait of Object.keys(rank)) {
    attributes.push({
      key: trait ?? "property",
      rank: rank[trait as keyof typeof rank],
      value: wizards[metadata.tokenId as keyof typeof wizards][trait],
      kind: "string",
    });
  }

  return {
    ...metadata,
    attributes,
  };
};
