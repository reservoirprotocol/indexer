/* eslint-disable @typescript-eslint/no-explicit-any */

import { TokenMetadata } from "@/metadata/types";

import souls from "./souls.json";

const rank = {
  Head: 13,
  Body: 12,
  Familiar: 11,
  Prop: 10,
  Rune: 9,
  Background: 8,
  Undesirable: 7,
  Affinity: 6,
  "% Traits in Affinity": 5,
  "# Traits in Affinity": 4,
  "# Traits": 3,
  Title: 2,
  Name: 1,
  Origin: 0,
};

export const extend = async (metadata: TokenMetadata) => {
  const attributes = [];
  let isUndesirable = false;
  const coreTraits = {
    Head: "",
    Body: "",
    Familiar: "",
    Prop: "",
    Rune: "",
  };

  metadata.attributes.forEach((attribute: { key: string; value: string | number | null }) => {
    const attributeKey = attribute.key.charAt(0).toUpperCase() + attribute.key.slice(1);
    attributes.push({
      key: attributeKey ?? "property",
      rank: rank[attributeKey as keyof typeof rank]
        ? rank[attributeKey as keyof typeof rank]
        : null,
      value: attribute.value,
      kind: "string",
    });

    if (attributeKey === "Undesirable") {
      isUndesirable = true;
    }

    if (attributeKey in coreTraits) {
      // eslint-disable-next-line
      coreTraits[attributeKey as keyof typeof coreTraits] = attribute.value as string;
    }
  });

  if (!isUndesirable) {
    // Add name traits
    for (const attribute of ["Title", "Name", "Origin"]) {
      if (
        String(metadata.tokenId) in souls &&
        souls[metadata.tokenId.toString() as keyof typeof souls]
      ) {
        const value = souls[metadata.tokenId.toString() as keyof typeof souls];
        attributes.push({
          key: attribute ?? "property",
          rank: rank[attribute as keyof typeof rank],
          value: value[attribute.toLowerCase() as keyof typeof value],
          kind: "string",
        });
      }
    }

    // Add None value for core traits
    for (const trait of ["Head", "Body", "Familiar", "Prop", "Rune"]) {
      if (!coreTraits[trait as keyof typeof coreTraits]) {
        attributes.push({
          key: trait ?? "property",
          rank: rank[trait as keyof typeof rank],
          value: "None",
          kind: "string",
        });
      }
    }
  }

  return {
    ...metadata,
    attributes,
  };
};
