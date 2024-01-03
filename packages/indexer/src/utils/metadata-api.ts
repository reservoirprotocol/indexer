/* eslint-disable @typescript-eslint/no-explicit-any */

import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";

import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";
import { logger } from "@/common/logger";
import { customHandleContractTokens, customHandleToken, hasCustomHandler } from "@/metadata/custom";
import { extendMetadata, hasExtendHandler } from "@/metadata/extend";

export interface TokenMetadata {
  contract: string;
  // TODO: standardize as string or number throughout the indexer
  tokenId: any;
  slug: string;
  collection: string;
  flagged: boolean;
  name?: string;
  description?: string;
  originalMetadata?: JSON;
  imageUrl?: string;
  imageOriginalUrl?: string;
  imageProperties?: {
    width?: number;
    height?: number;
    size?: number;
    mime_type?: string;
  };
  animationOriginalUrl?: string;
  metadataOriginalUrl?: string;
  mediaUrl?: string;
  attributes: {
    key: string;
    value: string;
    kind: "string" | "number" | "date" | "range";
    rank?: number;
  }[];
}

export interface CollectionMetadata {
  id: string;
  collection?: string;
  slug: string | null;
  name: string;
  community: string | null;
  metadata: {
    imageUrl?: string | undefined;
    // TODO: Add other metadata fields
    [key: string]: any;
  } | null;
  royalties?: object;
  openseaRoyalties?: object;
  openseaFees?: object;
  contract: string;
  tokenIdRange: [number, number] | [string, string] | null;
  tokenSetId: string | null;
  isFallback?: boolean;
  isCopyrightInfringement?: boolean;
  paymentTokens?: object | null;
  creator?: string | null;
}

export interface TokenMetadataBySlugResult {
  metadata: TokenMetadata[];
  continuation?: string;
  previous: string;
}

export class MetadataApi {
  public static async getCollectionMetadata(
    contract: string,
    tokenId: string,
    community = "",
    options?: {
      allowFallback?: boolean;
      indexingMethod?: string;
      additionalQueryParams?: { [key: string]: string };
    }
  ): Promise<CollectionMetadata> {
    if (config.liquidityOnly) {
      // When running in liquidity-only mode:
      // - assume the collection id matches the contract address
      // - the collection name is retrieved from an on-chain `name()` call

      const name = await new Contract(
        contract,
        new Interface(["function name() view returns (string)"]),
        baseProvider
      )
        .name()
        .catch(() => "");

      return {
        id: contract,
        slug: null,
        name,
        community: null,
        metadata: null,
        royalties: undefined,
        openseaRoyalties: undefined,
        openseaFees: undefined,
        contract,
        tokenIdRange: null,
        tokenSetId: `contract:${contract}`,
        isCopyrightInfringement: undefined,
        paymentTokens: undefined,
        creator: null,
      };
    } else {
      // get custom / extended metadata locally
      if (hasCustomHandler(config.chainId, contract)) {
        const result = await customHandleContractTokens(config.chainId, contract, tokenId);
        return result;
      }

      let indexingMethod =
        options?.indexingMethod ?? MetadataApi.getCollectionIndexingMethod(community);

      //TODO: Remove when adding proper support for overriding indexing method
      if (config.chainId === 1 && contract === "0xd532b88607b1877fe20c181cba2550e3bbd6b31c") {
        indexingMethod = "simplehash";
      }

      if (config.chainId === 137 && contract === "0x2953399124f0cbb46d2cbacd8a89cf0599974963") {
        indexingMethod = "simplehash";
      }

      let url = `${config.metadataApiBaseUrl
        }/v4/${getNetworkName()}/metadata/collection?method=${indexingMethod}&token=${contract}:${tokenId}`;
      if (options?.additionalQueryParams) {
        for (const [key, value] of Object.entries(options.additionalQueryParams)) {
          url += `&${key}=${value}`;
        }
      }

      logger.info(
        "metadata-api",
        `getCollectionMetadata url=${url}`
      );

      const { data } = await axios.get(url);

      const collection: CollectionMetadata = (data as any).collection;

      if (collection.isFallback && !options?.allowFallback) {
        throw new Error("Fallback collection data not acceptable");
      }

      return collection;
    }
  }

  public static async getTokensMetadata(
    tokens: { contract: string; tokenId: string }[],
    method = ""
  ): Promise<TokenMetadata[]> {
    // get custom / extended metadata locally
    const customMetadata = await Promise.all(
      tokens.map(async (token) => {
        if (hasCustomHandler(config.chainId, token.contract)) {
          const result = await customHandleToken(config.chainId, {
            contract: token.contract,
            _tokenId: token.tokenId,
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

    let metadataFromAPI: TokenMetadata[] = [];
    // If there are tokens without custom metadata, fetch from metadata-api
    if (tokensWithoutCustomMetadata.length > 0) {
      const queryParams = new URLSearchParams();

      tokensWithoutCustomMetadata.forEach((token) => {
        queryParams.append("token", `${token.contract}:${token.tokenId}`);
      });

      method = method === "" ? config.metadataIndexingMethod : method;

      const url = `${config.metadataApiBaseUrl
        }/v4/${getNetworkName()}/metadata/token?method=${method}&${queryParams.toString()}`;

      logger.info(
        "metadata-api",
        `getTokensMetadata url=${url}`
      );
      const { data } = await axios.get(url);

      metadataFromAPI = (data as any).metadata;
    }

    // merge custom metadata with metadata-api metadata
    const allMetadata = [...metadataFromAPI, ...filteredCustomMetadata];

    // extend metadata
    const extendedMetadata = await Promise.all(
      allMetadata.map(async (metadata) => {
        if (hasExtendHandler(config.chainId, metadata.contract)) {
          const result = await extendMetadata(config.chainId, metadata);
          return result;
        }
        return metadata;
      })
    );

    return extendedMetadata;
  }

  public static async parseTokenMetadata(
    request: {
      asset_contract: {
        address: string;
      };
      token_id: string;
      name?: string;
      description?: string;
      image_url?: string;
      animation_url?: string;
      traits: Array<{
        trait_type: string;
        value: string | number | null;
      }>;
    },
    method = ""
  ): Promise<TokenMetadata | null> {
    method = method === "" ? config.metadataIndexingMethod : method;

    const url = `${config.metadataApiBaseUrl
      }/v4/${getNetworkName()}/metadata/token?method=${method}`;

    let response;
    try {
      response = await axios.post(url, request);
    } catch (error: any) {
      logger.error(
        "metadata-api",
        `parseTokenMetadata error. url=${url}, request=${JSON.stringify(request)}, error=${error.message
        }`
      );
      return null;
    }
    const tokenMetadata: TokenMetadata = response.data;

    return tokenMetadata;
  }

  public static async getTokensMetadataBySlug(
    contract: string,
    slug: string,
    method = "",
    continuation?: string
  ): Promise<TokenMetadataBySlugResult> {
    const queryParams = new URLSearchParams();
    queryParams.append("collectionSlug", `${contract}:${slug}`);
    if (continuation) {
      queryParams.append("continuation", continuation);
    }
    method = method === "" ? config.metadataIndexingMethod : method;

    const url = `${config.metadataApiBaseUrl
      }/v4/${getNetworkName()}/metadata/token?method=${method}&${queryParams.toString()}`;

    const { data } = await axios.get(url);

    const metadata: TokenMetadata[] = (data as any).metadata;

    return { metadata, continuation: data.continuation, previous: data.previous };
  }

  public static getCollectionIndexingMethod(community: string | null) {
    switch (community) {
      case "sound.xyz":
        return "soundxyz";
    }

    return config.metadataIndexingMethodCollection;
  }
}

export { MetadataApi as default };
