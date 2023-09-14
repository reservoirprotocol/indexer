/* eslint-disable @typescript-eslint/no-explicit-any */

import { CollectionMetadata } from "@/utils/metadata-api";

export const extendCollection = async (
  _chainId: number,
  metadata: CollectionMetadata,
  _tokenId = null
) => {
  if (isNaN(Number(_tokenId)) || !_tokenId) {
    throw new Error(`Invalid tokenId ${_tokenId}`);
  }

  const startTokenId = _tokenId - (_tokenId % 1000000);
  const endTokenId = startTokenId + 1000000 - 1;

  metadata.id = `${metadata.contract}:${startTokenId}:${endTokenId}`;
  metadata.tokenIdRange = [startTokenId, endTokenId];
  metadata.tokenSetId = `range:${metadata.contract}:${startTokenId}:${endTokenId}`;
  metadata.isFallback = undefined;

  return { ...metadata };
};

export const extend = async (_chainId: number, metadata: any) => {
  const tokenId = metadata.tokenId;
  const startTokenId = tokenId - (tokenId % 1000000);
  const endTokenId = startTokenId + 1000000 - 1;

  metadata.collection = `${metadata.contract}:${startTokenId}:${endTokenId}`;
  return { ...metadata };
};
