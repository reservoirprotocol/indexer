/* eslint-disable @typescript-eslint/no-explicit-any */

import { TokenMetadata } from "@/metadata/types";

export const extend = async (metadata: TokenMetadata) => {
  return {
    ...metadata,
    imageUrl: metadata.imageOriginalUrl || metadata.imageUrl,
  };
};
