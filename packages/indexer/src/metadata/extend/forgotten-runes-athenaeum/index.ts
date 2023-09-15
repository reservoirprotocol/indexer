/* eslint-disable @typescript-eslint/no-explicit-any */

import { TokenMetadata } from "@/utils/metadata-api";

export const extend = async (_chainId: number, metadata: TokenMetadata) => {
  return {
    ...metadata,
    attributes: [
      {
        key: "Name",
        value: metadata.name,
        kind: "string",
        rank: 1,
      },
    ],
  };
};
