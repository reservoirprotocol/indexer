/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from "axios";
import _ from "lodash";
import ArtistContracts from "./ArtistContracts.json";
import ReleaseContracts from "./ReleaseContracts.json";
import { logger } from "@/common/logger";
import { CollectionMetadata, TokenMetadata } from "@/metadata/types";
import { config } from "@/config/index";

export const SoundxyzArtistContracts = ArtistContracts.map((c) => c.toLowerCase());
export const SoundxyzReleaseContracts = ReleaseContracts.map((c) => c.toLowerCase());

// generated from graphql:codegen outside this repo
export type SoundNftQuery = {
  nft: {
    title: string;
    audioUrl: string | null;
    coverImage: {
      id: string;
      url: string;
    };
    openSeaMetadataAttributes: {
      traitType: string | null;
      value: string;
    }[];
    release: {
      id: string;
      title: string;
      titleSlug: string;
      behindTheMusic: string;
      royaltyBps: number;
      fundingAddress: string;
      webappUri: string;
      artist: {
        id: string;
        name: string;
      };
      coverImage: {
        id: string;
        url: string;
      };
    };
  };
};

export const getMetadataFromSoundApi = async (
  contract: string,
  _tokenId: string
): Promise<{ data: { data: SoundNftQuery } }> => {
  const apiUrl = ![4, 5].includes(config.chainId)
    ? "https://api.sound.xyz/graphql?x-sound-client-name=firstmate"
    : "https://staging.api.sound.xyz/graphql";

  // if updating this, ensure that codegen is run and the type is also updated
  const query = `
        query SoundNft {
          nft(
            input: { contractAddress: "${contract}", tokenId: "${_tokenId}" }
          ) {
            title
            audioUrl
            coverImage {
              id
              url
            }
            openSeaMetadataAttributes {
              traitType
              value
            }
            release {
              id
              title
              titleSlug
              behindTheMusic
              royaltyBps
              fundingAddress
              webappUri
              artist {
                id
                name
              }
              coverImage {
                id
                url
              }
            }
          }
        }
  `;

  try {
    return axios.post(
      apiUrl,
      { query },
      {
        headers: {
          "x-sound-client-key": config.soundxyzApiKey,
          "CONTENT-TYPE": "application/json",
          "user-agent": config.soundxyzUserAgent,
        },
      }
    );
  } catch (error) {
    logger.error(
      "soundxyz-fetcher",
      `fetchCollection error. contract:${contract}, message:${error}`
    );

    throw error;
  }
};

export const extend = async (metadata: TokenMetadata) => {
  const {
    data: {
      data: { nft },
    },
  } = await getMetadataFromSoundApi(metadata.contract, metadata.tokenId);

  const { release, openSeaMetadataAttributes } = nft;

  metadata.name = nft.title;
  metadata.collection = `${metadata.contract}:soundxyz-${release.id}`;
  metadata.description = release.behindTheMusic;
  metadata.imageUrl = nft.coverImage.url;
  metadata.attributes = openSeaMetadataAttributes.map((trait) => ({
    key: trait.traitType ?? "property",
    value: trait.value,
    kind: typeof trait.value == "number" ? "number" : "string",
    rank: 1,
  }));

  return { ...metadata };
};

export const extendCollection = async (metadata: CollectionMetadata, _tokenId = null) => {
  if (isNaN(Number(_tokenId)) || !_tokenId) {
    throw new Error(`Invalid tokenId ${_tokenId}`);
  }

  const {
    data: {
      data: { nft },
    },
  } = await getMetadataFromSoundApi(metadata.contract, _tokenId);

  const { release } = nft;

  const royalties = [];

  if (release.fundingAddress && release.royaltyBps) {
    royalties.push({
      recipient: _.toLower(release.fundingAddress),
      bps: release.royaltyBps,
    });
  }

  if (!metadata.metadata) {
    metadata.metadata = {};
  }

  metadata.metadata.imageUrl = release.coverImage.url;
  metadata.metadata.description = release.behindTheMusic;
  metadata.metadata.externalUrl = release.webappUri;

  return {
    ...metadata,
    id: `${metadata.contract}:soundxyz-${release.id}`,
    name: `${release.artist.name} - ${release.title}`,
    community: "sound.xyz",
    royalties,
    tokenSetId: null,
    isFallback: undefined,
  };
};
