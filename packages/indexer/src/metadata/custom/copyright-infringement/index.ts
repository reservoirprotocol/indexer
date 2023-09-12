/* eslint-disable @typescript-eslint/no-unused-vars */

export const fetchCollection = async (
  _chainId: number,
  {
    contract,
    _tokenId,
  }: {
    contract: string;
    _tokenId: string;
  }
) => {
  return {
    id: contract,
    slug: contract,
    name: contract,
    community: null,
    metadata: null,
    contract,
    tokenIdRange: null,
    tokenSetId: `contract:${contract}`,
    royalties: [],
    openseaRoyalties: [],
    isCopyrightInfringement: true,
  };
};

export const fetchToken = async (
  _chainId: number,
  {
    contract,
    _tokenId,
  }: {
    contract: string;
    _tokenId: string;
  }
) => {
  return {
    contract,
    tokenId: _tokenId,
    collection: contract,
    slug: contract,
    name: null,
    flagged: false,
    description: null,
    imageUrl: null,
    imageOriginalUrl: null,
    animationOriginalUrl: null,
    metadataOriginalUrl: null,
    mediaUrl: null,
    attributes: [],
    isCopyrightInfringement: true,
  };
};
