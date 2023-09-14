/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { CollectionMetadata } from "@/utils/metadata-api";

export const extendCollection = async (
  _chainId: number,
  metadata: CollectionMetadata,
  _tokenId = null
) => {
  return {
    ...metadata,
    royalties: [
      {
        recipient: "0x00f7d4fc9ef2b9871b66e2265aba3a1eba65d345",
        bps: 750,
      },
    ],
  };
};
