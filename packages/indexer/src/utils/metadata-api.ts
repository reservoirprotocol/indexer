/* eslint-disable @typescript-eslint/no-explicit-any */

import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";
import slugify from "slugify";

import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";
import { logger } from "@/common/logger";

interface TokenMetadata {
  contract: string;
  tokenId: string;
  collection: string;
  flagged: boolean;
  name?: string;
  description?: string;
  imageUrl?: string;
  mediaUrl?: string;
  attributes: {
    key: string;
    value: string;
    kind: "string" | "number" | "date" | "range";
    rank?: number;
  }[];
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
    options?: { allowFallback?: boolean }
  ) {
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
        slug: slugify(name, { lower: true }),
        name,
        community: null,
        metadata: null,
        royalties: undefined,
        openseaRoyalties: undefined,
        contract,
        tokenIdRange: null,
        tokenSetId: `contract:${contract}`,
      };
    } else {
      const indexingMethod = MetadataApi.getCollectionIndexingMethod(community);

      const url = `${
        config.metadataApiBaseUrlAlt
      }/v4/${getNetworkName()}/metadata/collection?method=${indexingMethod}&token=${contract}:${tokenId}`;

      const { data } = await axios.get(url);

      const collection: {
        id: string;
        slug: string;
        name: string;
        community: string | null;
        metadata: object | null;
        royalties?: object;
        openseaRoyalties?: object;
        contract: string;
        tokenIdRange: [string, string] | null;
        tokenSetId: string | null;
        isFallback?: boolean;
      } = (data as any).collection;

      if (collection.isFallback && !options?.allowFallback) {
        throw new Error("Fallback collection data not acceptable");
      }

      return collection;
    }
  }

  public static async getTokensMetadata(
    tokens: { contract: string; tokenId: string }[],
    method = ""
  ) {
    const queryParams = new URLSearchParams();

    for (const token of tokens) {
      queryParams.append("token", `${token.contract}:${token.tokenId}`);
    }

    method = method === "" ? config.metadataIndexingMethod : method;

    const url = `${
      config.metadataApiBaseUrl
    }/v4/${getNetworkName()}/metadata/token?method=${method}&${queryParams.toString()}`;

    const { data } = await axios.get(url);

    const tokenMetadata: TokenMetadata[] = (data as any).metadata;

    return tokenMetadata;
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
        value: string | number;
      }>;
    },
    method = "opensea"
  ): Promise<TokenMetadata | null> {
    method = method === "" ? config.metadataIndexingMethod : method;

    const url = `${
      config.metadataApiBaseUrl
    }/v4/${getNetworkName()}/metadata/token?method=${method}`;

    let response;
    try {
      response = await axios.post(url, request);
    } catch (error: any) {
      logger.error("metadata-api", `parseTokenMetadata error: ${error.message}`);
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

    const url = `${
      config.metadataApiBaseUrl
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
