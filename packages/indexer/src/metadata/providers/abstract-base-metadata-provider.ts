import {
  customHandleCollection,
  customHandleToken,
  hasCustomCollectionHandler,
  hasCustomHandler,
} from "../custom";
import { CollectionMetadata, TokenMetadata } from "../types";
import {
  extendCollectionMetadata,
  extendMetadata,
  hasExtendHandler,
  overrideCollectionMetadata,
} from "../extend";
import { limitFieldSize } from "./utils";
import fetch from "node-fetch";

export abstract class AbstractBaseMetadataProvider {
  abstract method: string;

  // Wrapper methods for internal methods, handles custom/extend logic so subclasses don't have to
  async getCollectionMetadata(contract: string, tokenId: string): Promise<CollectionMetadata> {
    // Handle universal extend/custom logic here
    if (hasCustomCollectionHandler(contract)) {
      const result = await customHandleCollection({
        contract,
        tokenId: tokenId,
      });
      return result;
    }

    let collectionMetadata = await this._getCollectionMetadata(contract, tokenId);

    // Handle extend logic here
    collectionMetadata = await extendCollectionMetadata(collectionMetadata, tokenId);

    // Handle metadata override here
    return overrideCollectionMetadata(collectionMetadata);
  }

  async getTokensMetadata(
    tokens: { contract: string; tokenId: string; uri?: string }[]
  ): Promise<TokenMetadata[]> {
    const customMetadata = await Promise.all(
      tokens.map(async (token) => {
        if (hasCustomHandler(token.contract)) {
          const result = await customHandleToken({
            contract: token.contract,
            tokenId: token.tokenId,
          });
          return result;
        }
        return null;
      })
    );

    // filter out nulls
    const filteredCustomMetadata = customMetadata.filter((metadata) => metadata !== null);

    // for tokens that don't have custom metadata, get from metadata-api
    const tokensWithoutCustomMetadata = tokens.filter((token) => {
      const hasCustomMetadata = filteredCustomMetadata.find((metadata) => {
        return metadata.contract === token.contract && metadata.tokenId === token.tokenId;
      });

      return !hasCustomMetadata;
    });

    let metadataFromProvider: TokenMetadata[] = [];

    if (tokensWithoutCustomMetadata.length > 0) {
      metadataFromProvider = await this._getTokensMetadata(tokensWithoutCustomMetadata);
    }

    // merge custom metadata with metadata-api metadata
    const allMetadata: TokenMetadata[] = [...metadataFromProvider, ...filteredCustomMetadata];
    // extend metadata
    const extendedMetadata = await Promise.all(
      allMetadata.map(async (metadata) => {
        if (hasExtendHandler(metadata.contract)) {
          const result = await extendMetadata(metadata);
          return result;
        }
        return metadata;
      })
    );

    // get mimetype for each image/media/metadata url
    await Promise.all(
      extendedMetadata.map(async (metadata) => {
        if (metadata.imageUrl) {
          metadata.imageMimeType = await this._getImageMimeType(metadata.imageUrl);
        }
        if (metadata.mediaUrl) {
          metadata.mediaMimeType = await this._getImageMimeType(metadata.mediaUrl);
        }
      })
    );

    return extendedMetadata;
  }

  async _getImageMimeType(url: string): Promise<string> {
    // use fetch
    return fetch(url, {
      method: "HEAD",
    })
      .then((res) => {
        return res.headers.get("content-type") || "";
      })
      .catch(() => {
        return "";
      });
  }

  // Internal methods for subclasses
  protected abstract _getCollectionMetadata(
    contract: string,
    tokenId: string
  ): Promise<CollectionMetadata>;

  protected abstract _getTokensMetadata(
    tokens: { contract: string; tokenId: string }[]
  ): Promise<TokenMetadata[]>;

  // Parsers

  // eslint-disable-next-line
  protected abstract parseCollection(...args: any[]): CollectionMetadata;

  // eslint-disable-next-line
  protected abstract _parseToken(...args: any[]): TokenMetadata;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseToken(...args: any[]): TokenMetadata {
    const parsedMetadata = this._parseToken(...args);
    Object.keys(parsedMetadata).forEach((key) => {
      parsedMetadata[key as keyof TokenMetadata] = limitFieldSize(
        parsedMetadata[key as keyof TokenMetadata],
        key,
        parsedMetadata.contract,
        parsedMetadata.tokenId,
        this.method
      );
    });
    return parsedMetadata;
  }
}
