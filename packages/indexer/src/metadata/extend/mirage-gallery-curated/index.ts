/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { logger } from "@/common/logger";
import { CollectionMetadata, TokenMetadata } from "@/metadata/types";
import axios from "axios";

function getProjectID(tokenId: number) {
  const tokenStr = tokenId.toString();
  if (tokenStr.length === 5) {
    return parseInt(tokenStr[0], 10);
  } else if (tokenStr.length === 6) {
    return parseInt(tokenStr.slice(0, 2), 10);
  }
}

export const extendCollection = async (metadata: CollectionMetadata, _tokenId = null) => {
  if (isNaN(Number(_tokenId)) || !_tokenId) {
    throw new Error(`Invalid tokenId ${_tokenId}`);
  }

  const projectID = getProjectID(_tokenId);

  const url = `https://account.miragegallery.ai/curated-details.json`;
  const { data } = await axios.get(url);

  const projectDetails = data.data.find((item: any) => item.projectId === projectID);
  const miragePayoutAddress = data.curatedPayoutAddress;
  const mirageBPS = data.curatedPayoutBPS;
  const artistBPS = data.artistPayoutBPS;

  const startTokenId = _tokenId - (_tokenId % 10000);
  const endTokenId = startTokenId + 10000 - 1;

  let royalties;

  if (projectDetails.secondaryArtistAddress == "") {
    royalties = [
      { bps: mirageBPS, recipient: miragePayoutAddress },
      { bps: artistBPS, recipient: projectDetails.artistAddress },
    ];
  } else {
    royalties = [
      { bps: mirageBPS, recipient: miragePayoutAddress },
      { bps: artistBPS / 2, recipient: projectDetails.artistAddress },
      { bps: artistBPS / 2, recipient: projectDetails.secondaryArtistAddress },
    ];
  }

  let extURL = projectDetails.website;
  if (projectDetails.website == "") {
    extURL = "https://miragegallery.ai/curated";
  }

  return {
    ...metadata,
    community: "mirage-gallery-curated",
    id: `${metadata.contract}:${startTokenId}:${endTokenId}`,
    metadata: {
      ...metadata.metadata,
      imageUrl: projectDetails.image,
      bannerImageUrl: projectDetails.banner,
      description: projectDetails.description,
    },
    royalties,
    tokenIdRange: [startTokenId, endTokenId],
    tokenSetId: `range:${metadata.contract}:${startTokenId}:${endTokenId}`,
    isFallback: undefined,
  };
};

export const extend = async (metadata: TokenMetadata) => {
  let data;
  try {
    const response = await axios.get(`https://account.miragegallery.ai/curated-details.json`);
    data = response.data;
  } catch (error) {
    logger.error("mirage-gallery-curated-fetcher", `fetchTokens get json error. error:${error}`);

    throw error;
  }
  const projectID = getProjectID(metadata.tokenId);
  const projectDetails = data.data.find((item: any) => item.projectId === projectID);

  let metadataURL = projectDetails.metadata;

  if (metadataURL.startsWith("ipfs://")) {
    metadataURL = metadataURL.replace("ipfs://", "https://ipfs.io/ipfs/") + "/" + metadata.tokenId;
  } else {
    metadataURL = metadataURL + "/" + metadata.tokenId;
  }

  try {
    data = await axios.get(metadataURL);
  } catch (error) {
    logger.error(
      "mirage-gallery-curated-fetcher",
      `fetchTokens get metadataURL error.  metadataURL=${metadataURL}, error:${error}`
    );

    throw error;
  }

  const attributes = [];

  for (const item of data.data.attributes) {
    const key = item.trait_type ? item.trait_type : "Property";
    const value = item.value;

    attributes.push({
      key,
      rank: 1,
      value,
      kind: "string",
    });
  }

  const startTokenId = metadata.tokenId - (metadata.tokenId % 10000);
  const endTokenId = startTokenId + 10000 - 1;

  return {
    ...metadata,
    attributes,
    collection: `${metadata.contract}:${startTokenId}:${endTokenId}`,
  };
};
