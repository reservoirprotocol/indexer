/* eslint-disable @typescript-eslint/no-explicit-any */

import { CollectionMetadata, TokenMetadata } from "@/metadata/types";

const collectionsTokenIdRange = [
  [0, 665], // Grifters by XCOPY
  [666, 1289], // DecentralEyesMashup by Coldie
];

const getCollectionTokenIdRange = (_tokenId: number) => {
  return collectionsTokenIdRange.find(
    (collectionTokenIdRange) =>
      _tokenId >= collectionTokenIdRange[0] && _tokenId <= collectionTokenIdRange[1]
  );
};

export const extendCollection = async (metadata: CollectionMetadata, _tokenId = null) => {
  if (!_tokenId || isNaN(Number(_tokenId))) {
    throw new Error(`Invalid tokenId ${_tokenId}`);
  }

  const collectionTokenIdRange = getCollectionTokenIdRange(_tokenId);

  if (collectionTokenIdRange) {
    const [startTokenId, endTokenId] = collectionTokenIdRange;

    metadata.id = `${metadata.contract.toLowerCase()}:${startTokenId}:${endTokenId}`;
    metadata.tokenIdRange = [startTokenId, endTokenId];
    metadata.tokenSetId = `range:${metadata.contract.toLowerCase()}:${startTokenId}:${endTokenId}`;
    metadata.isFallback = undefined;
  }

  return metadata;
};

export const extend = async (metadata: TokenMetadata) => {
  const collectionTokenIdRange = getCollectionTokenIdRange(metadata.tokenId);

  if (collectionTokenIdRange) {
    const [startTokenId, endTokenId] = collectionTokenIdRange;
    metadata.collection = `${metadata.contract.toLowerCase()}:${startTokenId}:${endTokenId}`;
  }

  return metadata;
};
