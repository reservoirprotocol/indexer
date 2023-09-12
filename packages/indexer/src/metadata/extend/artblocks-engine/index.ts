/* eslint-disable @typescript-eslint/no-explicit-any */

import { CollectionMetadata, TokenMetadata } from "@/utils/metadata-api";
import axios from "axios";
import slugify from "slugify";

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

  let baseUrl = "https://token.artblocks.io";
  if (_chainId === 42161) {
    baseUrl = "https://token.arbitrum.artblocks.io";
  } else if ([4, 5].includes(_chainId)) {
    baseUrl = "https://token.staging.artblocks.io";
  }

  const url = `${baseUrl}/${metadata.contract}/${_tokenId}`;
  const { data } = await axios.get(url);

  return {
    ...metadata,
    metadata: {
      ...metadata.metadata,
      imageUrl: data.image,
      description: data.description,
      externalUrl: data.website,
    },
    name: data.collection_name,
    slug: metadata.isFallback ? slugify(data.collection_name, { lower: true }) : metadata.slug,
    community: data.platform.toLowerCase(),
    id: `${metadata.contract}:${startTokenId}:${endTokenId}`.toLowerCase(),
    tokenIdRange: [startTokenId, endTokenId],
    tokenSetId: `range:${metadata.contract}:${startTokenId}:${endTokenId}`,
    isFallback: undefined,
  };
};

export const extend = async (_chainId: number, metadata: TokenMetadata) => {
  const startTokenId = metadata.tokenId - (metadata.tokenId % 1000000);
  const endTokenId = startTokenId + 1000000 - 1;

  let baseUrl = "https://token.artblocks.io";
  if (_chainId === 42161) {
    baseUrl = "https://token.arbitrum.artblocks.io";
  } else if ([4, 5].includes(_chainId)) {
    baseUrl = "https://token.staging.artblocks.io";
  }

  const url = `${baseUrl}/${metadata.contract}/${metadata.tokenId}`;
  const { data } = await axios.get(url);

  const imageUrl = metadata.imageUrl ?? data.image;
  const mediaUrl = metadata.mediaUrl ?? data.animation_url ?? data.generator_url;

  const attributes = [];
  // Add None value for core traits
  for (const [key, value] of Object.entries(data.features)) {
    attributes.push({
      key,
      rank: 1,
      value,
      kind: "string",
    });
  }

  return {
    ...metadata,
    attributes,
    imageUrl,
    mediaUrl,
    collection: `${metadata.contract}:${startTokenId}:${endTokenId}`.toLowerCase(),
  };
};
