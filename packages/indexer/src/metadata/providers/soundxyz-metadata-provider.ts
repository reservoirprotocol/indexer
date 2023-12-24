/* eslint-disable @typescript-eslint/no-explicit-any */

import { CollectionMetadata, TokenMetadata } from "../types";
import { logger } from "@/common/logger";

import _ from "lodash";
import * as soundxyz from "../extend/soundxyz/index";
import { RequestWasThrottledError } from "./utils";
import { openseaMetadataProvider } from "./opensea-metadata-provider";
import { AbstractBaseMetadataProvider } from "./abstract-base-metadata-provider";
import { SoundNftQuery } from "../extend/soundxyz/index";

export class SoundxyzMetadataProvider extends AbstractBaseMetadataProvider {
  method = "soundxyz";

  async _getCollectionMetadata(contract: string, tokenId: string): Promise<CollectionMetadata> {
    const {
      data: {
        data: { nft },
      },
    } = await soundxyz.getMetadataFromSoundApi(contract, tokenId);

    const openseaRoyalties = await openseaMetadataProvider
      .getCollectionMetadata(contract, tokenId)
      .then((m) => m.openseaRoyalties)
      .catch(() => []);

    return this.parseCollection(nft.release, contract, openseaRoyalties);
  }

  async _getTokensMetadata(
    tokens: { contract: string; tokenId: string }[]
  ): Promise<TokenMetadata[]> {
    const data = [];

    for (const { contract, tokenId } of tokens) {
      try {
        const [response, collection] = await Promise.all([
          soundxyz.getMetadataFromSoundApi(contract, tokenId),
          this.getCollectionId(contract, tokenId),
        ]);

        data.push(this.parseToken(response.data.data.nft, contract, tokenId, collection));
      } catch (error) {
        logger.error(
          "soundxyz-fetcher",
          `fetchTokens error. contract:${contract}, tokenId:${tokenId}, error:${error}`
        );

        this.handleError(error);
      }
    }

    // TODO: remove this
    return data.filter(Boolean) as TokenMetadata[];
  }

  async getCollectionId(contract: string, tokenId: string) {
    // If this is not a shared contract collection -> contract
    if (
      _.indexOf(soundxyz.SoundxyzArtistContracts, _.toLower(contract)) === -1 &&
      _.indexOf(soundxyz.SoundxyzReleaseContracts, _.toLower(contract)) === -1
    ) {
      return contract;
    }

    // Shared contract logic
    const {
      data: {
        data: { nft },
      },
    } = await soundxyz.getMetadataFromSoundApi(contract, tokenId);
    return `${contract}:soundxyz-${nft.release.id}`;
  }

  _parseToken(
    nft: SoundNftQuery["nft"],
    contract: string,
    tokenId: string,
    collection: any
  ): TokenMetadata {
    return {
      contract: contract,
      tokenId: tokenId,
      collection,
      slug: null,
      name: nft.title,
      flagged: false,
      description: nft.release.behindTheMusic,
      imageUrl: nft.coverImage.url,
      mediaUrl: nft.audioUrl,
      attributes: nft.openSeaMetadataAttributes.map((trait) => ({
        key: trait.traitType ?? "property",
        value: trait.value,
        kind: typeof trait.value == "number" ? "number" : "string",
        rank: 1,
      })),
    };
  }

  parseCollection(
    release: SoundNftQuery["nft"]["release"],
    contract: string,
    openseaRoyalties?: object
  ): CollectionMetadata {
    const royalties = [];

    if (release.fundingAddress && release.royaltyBps) {
      royalties.push({
        recipient: _.toLower(release.fundingAddress),
        bps: release.royaltyBps,
      });
    }

    return {
      id: `${contract}`,
      slug: release.titleSlug,
      name: `${release.artist.name} - ${release.title}`,
      community: "sound.xyz",
      metadata: {
        imageUrl: release.coverImage.url,
        description: release.behindTheMusic,
        externalUrl: release.webappUri,
      },
      royalties,
      openseaRoyalties: openseaRoyalties,
      contract,
      tokenIdRange: null,
      tokenSetId: `contract:${contract}`,
    };
  }

  handleError(error: any) {
    if (error.response?.status === 429 || error.response?.status === 503) {
      let delay = 1;

      if (error.response.data.detail?.startsWith("Request was throttled. Expected available in")) {
        try {
          delay = error.response.data.detail.split(" ")[6];
        } catch {
          // Skip on any errors
        }
      }

      throw new RequestWasThrottledError(error.response.statusText, delay);
    }

    throw error;
  }
}

export const soundxyzMetadataProvider = new SoundxyzMetadataProvider();
