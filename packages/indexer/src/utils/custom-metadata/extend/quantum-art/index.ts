/* eslint-disable @typescript-eslint/no-explicit-any */

export const extendCollection = async (_chainId: number, metadata: any, _tokenId = null) => {
  if (isNaN(Number(_tokenId)) || !_tokenId) {
    throw new Error(`Invalid tokenId ${_tokenId}`);
  }

  const startTokenId = _tokenId - (_tokenId % 10000);
  const endTokenId = startTokenId + 10000 - 1;

  metadata.id = `${metadata.contract}:${startTokenId}:${endTokenId}`;
  metadata.tokenIdRange = [startTokenId, endTokenId];
  metadata.tokenSetId = `range:${metadata.contract}:${startTokenId}:${endTokenId}`;

  return { ...metadata };
};

export const extend = async (_chainId: number, metadata: any) => {
  const tokenId = metadata.tokenId;
  const startTokenId = tokenId - (tokenId % 10000);
  const endTokenId = startTokenId + 10000 - 1;

  metadata.collection = `${metadata.contract}:${startTokenId}:${endTokenId}`;
  return { ...metadata };
};
