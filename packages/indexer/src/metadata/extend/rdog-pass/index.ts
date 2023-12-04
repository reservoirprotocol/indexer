/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "@/config/index";
import { CollectionMetadata } from "@/metadata/types";
import axios from "axios";

export const extendCollection = async (metadata: CollectionMetadata, _tokenId: number) => {
  const url = `https://api.simplehash.com/api/v0/nfts/polygon/${metadata.contract}/${_tokenId}`;
  const data: any = await axios.get(url, {
    headers: { "X-API-KEY": config.simplehashApiKey.trim() },
  });

  return {
    ...metadata,
    metadata: {
      ...metadata.metadata,
      imageUrl: data?.data?.collection?.image_url,
    },
  };
};
