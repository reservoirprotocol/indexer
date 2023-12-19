/* eslint-disable @typescript-eslint/no-explicit-any */

import { TokenMetadata } from "@/metadata/types";

import CollectiblesContracts from "./contracts.json";

export const CollectiblesCollections = CollectiblesContracts.map((c) => c.toLowerCase());

export const extend = async (metadata: TokenMetadata) => {
  const [series, tokenNumber] = metadata?.name ? metadata.name.split("#") : [];

  if (tokenNumber && parseInt(tokenNumber) < 100) {
    metadata.attributes = [
      ...metadata.attributes,
      {
        key: "Token Count",
        value: "Double Digits",
        kind: "string",
      },
    ];
  }

  return {
    ...metadata,
    attributes: series
      ? [
          ...metadata.attributes,
          {
            key: "Series",
            value: series.trim(),
            kind: "string",
          },
        ]
      : metadata.attributes,
  };
};
