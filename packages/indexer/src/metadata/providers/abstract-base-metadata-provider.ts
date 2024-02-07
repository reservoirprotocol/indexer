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

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import axios from "axios";

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
        const debugMissingTokenImages = await redis.sismember(
          "missing-token-image-contracts",
          metadata.contract
        );

        if (debugMissingTokenImages) {
          logger.info(
            "getTokensMetadata",
            JSON.stringify({
              topic: "debugMissingTokenImages",
              message: `_getTokensMetadata. contract=${metadata.contract}, contract=${metadata.tokenId}, method=${this.method}`,
              metadata: JSON.stringify(metadata),
            })
          );
        }

        if (hasExtendHandler(metadata.contract)) {
          const result = await extendMetadata(metadata);

          if (debugMissingTokenImages) {
            logger.info(
              "getTokensMetadata",
              JSON.stringify({
                topic: "debugMissingTokenImages",
                message: `extendMetadata. contract=${metadata.contract}, contract=${metadata.tokenId}, method=${this.method}`,
                result: JSON.stringify(result),
              })
            );
          }

          return result;
        }
        return metadata;
      })
    );

    // get mimetype for each image/media/metadata url
    await Promise.all(
      extendedMetadata.map(async (metadata) => {
        try {
          if (
            metadata.imageUrl &&
            !metadata.imageUrl.startsWith("data:") &&
            !metadata.imageMimeType
          ) {
            metadata.imageMimeType = await this._getImageMimeType(metadata.imageUrl);

            const debugMissingTokenImages = await redis.sismember(
              "missing-token-image-contracts",
              metadata.contract
            );

            if (debugMissingTokenImages) {
              logger.info(
                "getTokensMetadata",
                JSON.stringify({
                  topic: "debugMissingTokenImages",
                  message: `_getImageMimeType. contract=${metadata.contract}, contract=${metadata.tokenId}, method=${this.method}, imageMimeType=${metadata.imageMimeType}`,
                  metadata: JSON.stringify(metadata),
                })
              );
            }

            if (metadata.contract === "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d") {
              metadata.imageMimeType = "image/png";
            }

            if (!metadata.imageMimeType) {
              logger.warn(
                "getTokensMetadata",
                JSON.stringify({
                  topic: debugMissingTokenImages ? "debugMissingTokenImages" : "debugMimeType",
                  message: `Missing image mime type. contract=${metadata.contract}, tokenId=${metadata.tokenId}, imageUrl=${metadata.imageUrl}`,
                  metadata: JSON.stringify(metadata),
                  method: this.method,
                })
              );
            }
          }

          if (
            metadata.mediaUrl &&
            !metadata.mediaUrl.startsWith("data:") &&
            !metadata.mediaMimeType
          ) {
            metadata.mediaMimeType = await this._getImageMimeType(metadata.mediaUrl);

            if (!metadata.mediaMimeType) {
              logger.warn(
                "getTokensMetadata",
                JSON.stringify({
                  topic: debugMissingTokenImages ? "debugMissingTokenImages" : "debugMimeType",
                  message: `Missing media mime type. contract=${metadata.contract}, tokenId=${metadata.tokenId}, mediaUrl=${metadata.mediaUrl}`,
                  metadata: JSON.stringify(metadata),
                  method: this.method,
                })
              );
            }
          }

          const imageMimeTypesPrefixes = ["image/", "application/octet-stream"];

          // if the imageMimeType is not an "image" mime type, we want to set imageUrl to null and mediaUrl to imageUrl
          if (
            metadata.imageUrl &&
            metadata.imageMimeType &&
            !imageMimeTypesPrefixes.some((imageMimeTypesPrefix) =>
              metadata.imageMimeType.startsWith(imageMimeTypesPrefix)
            )
          ) {
            metadata.mediaUrl = metadata.imageUrl;
            metadata.mediaMimeType = metadata.imageMimeType;
            metadata.imageUrl = null;
            metadata.imageMimeType = undefined;
          }
        } catch (error) {
          logger.error(
            "getTokensMetadata",
            JSON.stringify({
              message: `extendedMetadata error. contract=${metadata.contract}, tokenId=${metadata.tokenId}, error=${error}`,
              metadata,
              error,
            })
          );

          throw error;
        }
      })
    );

    return extendedMetadata;
  }

  async _getImageMimeType(url: string): Promise<string> {
    if (url.endsWith(".png")) {
      return "image/png";
    }
    if (url.endsWith(".jpg") || url.endsWith(".jpeg")) {
      return "image/jpeg";
    }
    if (url.endsWith(".gif")) {
      return "image/gif";
    }
    if (url.endsWith(".svg")) {
      return "image/svg+xml";
    }
    if (url.endsWith(".mp4")) {
      return "video/mp4";
    }
    if (!url.startsWith("http")) {
      return "";
    }

    let imageMimeType = await redis.get(`imageMimeType:${url}`);

    if (!imageMimeType) {
      // use fetch
      imageMimeType = await axios
        .head(url)
        .then((res) => res.headers["content-type"])
        .catch((error) => {
          logger.warn(
            "_getImageMimeType",
            JSON.stringify({
              topic: "debugMimeType",
              message: `Error. url=${url}, error=${error}`,
              error,
            })
          );
        });

      if (imageMimeType) {
        await redis.set(`imageMimeType:${url}`, imageMimeType, "EX", 3600);
      }
    }

    return imageMimeType || "";
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
