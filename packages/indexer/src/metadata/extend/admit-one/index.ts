/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { CollectionMetadata } from "@/metadata/types";
export const extendCollection = async (metadata: CollectionMetadata, _tokenId = null) => {
  return {
    ...metadata,
    metadata: {
      ...metadata.metadata,
      imageUrl: "https://i.ibb.co/hy6vSS2/gmoney-collection.png",
    },
  };
};
