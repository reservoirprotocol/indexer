/* eslint-disable @typescript-eslint/no-explicit-any */

import { CollectionMetadata, TokenMetadata } from "@/utils/metadata-api";

const collectionsTokenIdRange = [
  [
    "Winslow Homer's Croquet Challenge by Mitchell F. Chan",
    "25811853076941608055270457512038717433705462539422789705262203111341130500760",
    "25811853076941608055270457512038717433705462539422789705262203111341130501225",
  ],
];

const getCollectionTokenIdRange = (tokenId: number) => {
  return collectionsTokenIdRange.find(
    (collectionInfo) =>
      collectionInfo[1] <= tokenId.toString() && tokenId.toString() <= collectionInfo[2]
  );
};

export const extendCollection = async (
  _chainId: number,
  metadata: CollectionMetadata,
  _tokenId = null
) => {
  if (isNaN(Number(_tokenId)) || !_tokenId) {
    throw new Error(`Invalid tokenId ${_tokenId}`);
  }

  const collection = getCollectionTokenIdRange(_tokenId);

  if (collection) {
    const [collectionName, startTokenId, endTokenId] = collection;
    metadata.name = collectionName;
    metadata.id = `${metadata.contract.toLowerCase()}:${startTokenId}:${endTokenId}`;
    metadata.tokenIdRange = [startTokenId, endTokenId];
    metadata.tokenSetId = `range:${metadata.contract.toLowerCase()}:${startTokenId}:${endTokenId}`;
    metadata.isFallback = undefined;
  }

  return metadata;
};

export const extend = async (_chainId: number, metadata: TokenMetadata) => {
  const collection = getCollectionTokenIdRange(metadata.tokenId);

  if (collection) {
    const [collectionName, startTokenId, endTokenId] = collection;
    metadata.name = collectionName;
    metadata.collection = `${metadata.contract.toLowerCase()}:${startTokenId}:${endTokenId}`;
  }

  return metadata;
};
