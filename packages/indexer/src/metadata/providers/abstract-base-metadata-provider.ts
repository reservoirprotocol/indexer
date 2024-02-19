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
import { config } from "@/config/index";

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
        if (config.chainId === 1) {
          const tokenMetadataIndexingDebug = await redis.sismember(
            "metadata-indexing-debug-contracts",
            metadata.contract
          );

          if (tokenMetadataIndexingDebug) {
            logger.info(
              "getTokensMetadata",
              JSON.stringify({
                topic: "tokenMetadataIndexingDebug",
                message: `_getTokensMetadata. contract=${metadata.contract}, tokenId=${metadata.tokenId}, method=${this.method}`,
                metadata: JSON.stringify(metadata),
              })
            );
          }
        }

        if (hasExtendHandler(metadata.contract)) {
          return extendMetadata(metadata);
        }

        return metadata;
      })
    );

    // get mimetype for each image/media/metadata url
    await Promise.all(
      extendedMetadata.map(async (metadata) => {
        try {
          let tokenMetadataIndexingDebug = 0;

          if (config.chainId === 1) {
            tokenMetadataIndexingDebug = await redis.sismember(
              "metadata-indexing-debug-contracts",
              metadata.contract
            );
          }

          if (
            metadata.imageUrl &&
            !metadata.imageUrl.startsWith("data:") &&
            !metadata.imageMimeType
          ) {
            metadata.imageMimeType = await this._getImageMimeType(
              metadata.imageUrl,
              metadata.contract,
              metadata.tokenId
            );

            if (tokenMetadataIndexingDebug) {
              logger.info(
                "getTokensMetadata",
                JSON.stringify({
                  topic: "tokenMetadataIndexingDebug",
                  message: `_getImageMimeType. contract=${metadata.contract}, tokenId=${metadata.tokenId}, method=${this.method}, imageMimeType=${metadata.imageMimeType}`,
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
                  topic: tokenMetadataIndexingDebug
                    ? "tokenMetadataIndexingDebug"
                    : "debugMimeType",
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
            metadata.mediaMimeType = await this._getImageMimeType(
              metadata.mediaUrl,
              metadata.contract,
              metadata.tokenId
            );

            if (!metadata.mediaMimeType) {
              logger.warn(
                "getTokensMetadata",
                JSON.stringify({
                  topic: "debugMimeType",
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

  async _getImageMimeType(url: string, contract: string, tokenId: string): Promise<string> {
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
          const fallbackToIpfsGateway = config.ipfsGatewayDomain && url.includes("ipfs.io");

          if (fallbackToIpfsGateway) {
            const ipfsGatewayUrl = url.replace("ipfs.io", config.ipfsGatewayDomain);

            return axios
              .head(ipfsGatewayUrl)
              .then((res) => res.headers["content-type"])
              .catch((fallbackError) => {
                logger.warn(
                  "_getImageMimeType",
                  JSON.stringify({
                    topic: "debugMissingTokenImages",
                    message: `Fallback Error. contract=${contract}, tokenId=${tokenId}, url=${url}, ipfsGatewayUrl=${ipfsGatewayUrl}, error=${error}, fallbackError=${fallbackError}`,
                    error,
                    fallbackError,
                  })
                );
              });
          } else {
            logger.warn(
              "_getImageMimeType",
              JSON.stringify({
                topic: "debugMissingTokenImages",
                message: `Error. contract=${contract}, tokenId=${tokenId}, url=${url}, error=${error}`,
                error,
              })
            );
          }
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
