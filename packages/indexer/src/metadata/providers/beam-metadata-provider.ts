/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "@/config/index";
import { CollectionMetadata, TokenMetadata, TokenMetadataBySlugResult } from "../types";
import axios from "axios";
import { RequestWasThrottledError } from "./utils";
import _ from "lodash";
import { AbstractBaseMetadataProvider } from "./abstract-base-metadata-provider";


interface Token {
  id: string;
  tokenId: string;
  contract: string;
  chain: number;
  rawMetadata?: RawMetadata;
  rawMetadataUrl: string;
  image?: Image;
  animationUrl?: string;
}

interface RawMetadata {
  name?: string;
  image?: string;
  description?: string;
  external_url?: string;
  animation_url?: string;
}

interface Image {
  id: string;
  originalUrl: string;
  s3Key: string;
  s3Bucket: string;
  s3Url: string;
  createdAt: string;
  updatedAt: string;
}

export class BeamMetadataProvider extends AbstractBaseMetadataProvider {
  method = "beam";

  async _getCollectionMetadata(contract: string, tokenId: string): Promise<CollectionMetadata> {
    // TODO: implement
    // @ts-expect-error
    return {};
  }

  async _getTokensMetadata(tokens: { contract: string; tokenId: string }[]): Promise<TokenMetadata[]> {
    const tokenQueries = tokens.map(({ contract, tokenId }) => `${contract}:${tokenId}`).join(',');
    const url = `http://35.159.15.191:3000/metadata/tokens/${config.chainId}?tokens=${encodeURIComponent(tokenQueries)}`;

    try {
      const response = await axios.get(url);
      return response.data.map(this.parseToken).filter(Boolean); // Modify as per your data structure
    } catch (error) {
      this.handleError(error);
    }

    return [];
  }

  async _getTokensMetadataBySlug(): Promise<TokenMetadataBySlugResult> {
    throw new Error("Method not implemented.");
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

  parseToken(metadata: Token): TokenMetadata {
    return {
      contract: _.toLower(metadata.contract),
      tokenId: metadata.tokenId,
      name: metadata.rawMetadata?.name,
      collection: _.toLower(metadata.contract),
      flagged: null,
      slug: null,
      // slug:
      //   metadata.collection.marketplace_pages?.filter(
      //     (market: any) => market.marketplace_id === "opensea"
      //   )[0]?.marketplace_collection_id ?? undefined,
      // Token descriptions are a waste of space for most collections we deal with
      // so by default we ignore them (this behaviour can be overridden if needed).
      description: metadata.rawMetadata?.description,
      originalMetadata: metadata.rawMetadata as JSON,
      imageUrl: metadata.image?.s3Url,
      imageOriginalUrl: metadata.rawMetadata?.image,
      animationOriginalUrl: metadata.rawMetadata?.animation_url,
      metadataOriginalUrl: metadata.rawMetadataUrl,
      imageProperties: undefined,
      mediaUrl: undefined,
      attributes: [],

      // TODO: support media url
      // mediaUrl: metadata.video_url ?? metadata.audio_url ?? media,

      // TODO: support attributes
      // attributes: (attributes || []).map((trait: any) => ({
      //   key: trait.trait_type ?? "property",
      //   value: trait.value,
      //   kind: typeof trait.value == "number" ? "number" : "string",
      //   rank: 1,
      // })),
    };
  }

  protected parseCollection(metadata: any, contract: string): CollectionMetadata {
    throw new Error("Method not implemented.");

    // let slug = null;
    // if (_.isArray(metadata.collection.marketplace_pages)) {
    //   for (const market of metadata.collection.marketplace_pages) {
    //     if (market.marketplace_id === "opensea") {
    //       slug = slugify(market.marketplace_collection_id, { lower: true });
    //     }
    //   }
    // }

    // return {
    //   id: contract,
    //   slug,
    //   name: metadata.collection.name,
    //   community: null,
    //   metadata: normalizeMetadata(metadata.collection),
    //   contract,
    //   tokenIdRange: null,
    //   tokenSetId: `contract:${contract}`,
    //   creator: _.toLower(metadata.contract.deployed_by),
    // };
  }
}

export const beamMetadataProvider = new BeamMetadataProvider();
