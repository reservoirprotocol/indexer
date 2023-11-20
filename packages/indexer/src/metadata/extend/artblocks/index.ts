/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import axios from "axios";
import slugify from "slugify";
import { CollectionMetadata, TokenMetadata } from "@/metadata/types";

export const extendCollection = async (metadata: CollectionMetadata, _tokenId = null) => {
  if (!_tokenId || isNaN(Number(_tokenId))) {
    throw new Error(`Invalid tokenId ${_tokenId}`);
  }

  const startTokenId = _tokenId - (_tokenId % 1000000);
  const endTokenId = startTokenId + 1000000 - 1;

  const { data } = await axios.get(`https://token.artblocks.io/${_tokenId}`);

  return {
    ...metadata,
    metadata: {
      ...metadata.metadata,
      imageUrl: metadata.isFallback
        ? `https://media.artblocks.io/${startTokenId}.png`
        : metadata?.metadata?.imageUrl,
      description: data.description,
      externalUrl: data.website,
    },
    name: data.collection_name,
    slug: metadata.isFallback ? slugify(data.collection_name, { lower: true }) : metadata.slug,
    community: "artblocks",
    id: `${metadata.contract}:${startTokenId}:${endTokenId}`,
    tokenIdRange: [startTokenId, endTokenId],
    tokenSetId: `range:${metadata.contract}:${startTokenId}:${endTokenId}`,
    isFallback: undefined,
  };
};

export const extend = async (metadata: TokenMetadata) => {
  const startTokenId = metadata.tokenId - (metadata.tokenId % 1000000);
  const endTokenId = startTokenId + 1000000 - 1;

  const url = `https://token.artblocks.io/${metadata.tokenId}`;
  const { data } = await axios.get(url);

  const imageUrl = metadata.imageUrl ?? data.image;
  const mediaUrl = metadata.mediaUrl ?? data.animation_url ?? data.generator_url;

  const attributes = [];

  if (data.features) {
    // Add None value for core traits
    for (const [key, value] of Object.entries(data.features)) {
      attributes.push({
        key,
        rank: 1,
        value,
        kind: "string",
      });
    }
  }

  return {
    ...metadata,
    attributes,
    imageUrl,
    mediaUrl,
    collection: _.toLower(`${metadata.contract}:${startTokenId}:${endTokenId}`),
  };
};
