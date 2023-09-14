/* eslint-disable @typescript-eslint/no-explicit-any */

import { TokenMetadata } from "@/utils/metadata-api";
import CollectiblesContracts from "./contracts.json";

export const CollectiblesCollections = CollectiblesContracts.map((c) => c.toLowerCase());

export const extend = async (_chainId: number, metadata: TokenMetadata) => {
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
    attributes: [
      ...metadata.attributes,
      {
        key: "Series",
        value: series.trim(),
        kind: "string",
      },
    ],
  };
};
