/* eslint-disable @typescript-eslint/no-explicit-any */

import { CollectionMetadata, TokenMetadata, TokenMetadataBySlugResult } from "../types";
import { logger } from "@/common/logger";

import _ from "lodash";
import slugify from "slugify";
import * as soundxyz from "../extend/soundxyz/index";
import { RequestWasThrottledError } from "./utils";
import { openseaMetadataProvider } from "./opensea-metadata-provider";
import { AbstractBaseMetadataProvider } from "./abstract-base-metadata-provider";

export class SoundxyzMetadataProvider extends AbstractBaseMetadataProvider {
  method = "soundxyz";

  async _getCollectionMetadata(contract: string, tokenId: string): Promise<CollectionMetadata> {
    const {
      data: {
        data: { releaseFromToken },
      },
    } = await soundxyz.getContractSlug(contract, tokenId);

    const openseaRoyalties = await openseaMetadataProvider
      .getCollectionMetadata(contract, tokenId)
      .then((m) => m.openseaRoyalties)
      .catch(() => []);

    return this.parseCollection(releaseFromToken, contract, openseaRoyalties);
  }

  async _getTokensMetadata(
    tokens: { contract: string; tokenId: string }[]
  ): Promise<TokenMetadata[]> {
    const data = [];

    for (const { contract, tokenId } of tokens) {
      try {
        const [openseaResponse, collection] = await Promise.all([
          openseaMetadataProvider.getTokensMetadata([{ contract, tokenId }]),
          this.getCollectionId(contract, tokenId),
        ]);

        if (!openseaResponse || openseaResponse.length !== 1) {
          // unexpected returned data
          throw new Error("Opensea token metadata not returning expected data for sound nft")
        }
        const tokenMetadata = openseaResponse[0];


        data.push(
          this.parseToken(tokenMetadata, collection)
        );
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

  async _getTokensMetadataBySlug(): Promise<TokenMetadataBySlugResult> {
    throw new Error("Method not implemented.");
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
        data: { releaseFromToken },
      },
    } = await soundxyz.getContractSlug(contract, tokenId);
    return `${contract}:soundxyz-${releaseFromToken.id}`;
  }

  parseToken(metadata: TokenMetadata, collection: any): TokenMetadata {
    return {
      ...metadata,
      collection,
      slug: null,
      flagged: false,
    };
  }

  parseCollection(metadata: any, contract: string, openseaRoyalties?: object): CollectionMetadata {
    const royalties = [];

    if (metadata.fundingAddress && metadata.royaltyBps) {
      royalties.push({
        recipient: _.toLower(metadata.fundingAddress),
        bps: metadata.royaltyBps,
      });
    }

    return {
      id: `${contract}`,
      slug: slugify(metadata.titleSlug, { lower: true }),
      name: `${metadata.artist.name} - ${metadata.title}`,
      community: "sound.xyz",
      metadata: {
        imageUrl: metadata.coverImage.url,
        description: metadata.description,
        externalUrl: `https://sound.xyz/${metadata.artist.soundHandle}/${metadata.titleSlug}`,
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
