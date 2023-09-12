/* eslint-disable @typescript-eslint/no-explicit-any */

import { CollectionMetadata } from "@/utils/metadata-api";
import _ from "lodash";

export const extendCollection = async (
  _chainId: number,
  metadata: CollectionMetadata,
  _tokenId = null
) => {
  let startTokenId;
  let endTokenId;

  if (!_tokenId || !_.isNumber(_tokenId) || _tokenId < 0 || _tokenId > 5000) {
    throw new Error(`Unknown tokenId ${_tokenId}`);
  }

  if (_tokenId <= 1000) {
    startTokenId = 1;
    endTokenId = 1000;
  } else {
    startTokenId = 1001;
    endTokenId = 5000;
  }

  metadata.id = `${metadata.contract}:${startTokenId}:${endTokenId}`;
  metadata.tokenIdRange = [startTokenId, endTokenId];
  metadata.tokenSetId = `range:${metadata.contract}:${startTokenId}:${endTokenId}`;
  metadata.isFallback = undefined;

  return { ...metadata };
};

export const extend = async (_chainId: number, metadata: any) => {
  const tokenId = metadata.tokenId;
  let startTokenId;
  let endTokenId;

  if (tokenId <= 1000) {
    startTokenId = 1;
    endTokenId = 1000;
  } else {
    startTokenId = 1001;
    endTokenId = 5000;
  }

  metadata.collection = `${metadata.contract}:${startTokenId}:${endTokenId}`;
  return { ...metadata };
};
