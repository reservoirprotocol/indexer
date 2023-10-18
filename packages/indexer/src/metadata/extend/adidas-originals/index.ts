/* eslint-disable @typescript-eslint/no-explicit-any */

import { TokenMetadata } from "@/metadata/types";

export const extend = async (metadata: TokenMetadata) => {
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
