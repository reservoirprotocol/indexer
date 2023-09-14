/* eslint-disable @typescript-eslint/no-explicit-any */

import { TokenMetadata } from "@/utils/metadata-api";

export const extend = async (_chainId: number, metadata: TokenMetadata) => {
  const traitCount = metadata.attributes.length;

  return {
    ...metadata,
    attributes: [
      ...metadata.attributes,
      {
        key: "Trait Count",
        value: traitCount,
        kind: "string",
      },
    ],
  };
};
