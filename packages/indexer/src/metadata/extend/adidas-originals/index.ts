/* eslint-disable @typescript-eslint/no-explicit-any */

import { TokenMetadata } from "@/utils/metadata-api";

export const extend = async (_chainId: number, metadata: TokenMetadata) => {
  let name = metadata.name;
  if (metadata.tokenId == 0) {
    name = "Phase 1";
  } else {
    name = "Phase 2";
  }

  return {
    ...metadata,
    name,
  };
};
