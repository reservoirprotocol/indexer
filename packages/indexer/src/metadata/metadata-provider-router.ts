/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "@/config/index";
import { MetadataProvidersMap } from "@/metadata/providers";
import { CollectionMetadata, TokenMetadata } from "@/metadata/types";

export class MetadataProviderRouter {
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
      return await MetadataProvidersMap["onchain"].getCollectionMetadata(contract, tokenId);
    }

    let indexingMethod = options?.indexingMethod ?? this.getCollectionIndexingMethod(community);

    //TODO: Remove when adding proper support for overriding indexing method
    if (config.chainId === 1 && contract === "0xd532b88607b1877fe20c181cba2550e3bbd6b31c") {
      indexingMethod = "simplehash";
    }

    if (config.chainId === 137 && contract === "0x2953399124f0cbb46d2cbacd8a89cf0599974963") {
      indexingMethod = "simplehash";
    }

    const collection: CollectionMetadata = await MetadataProvidersMap[
      indexingMethod
    ].getCollectionMetadata(contract, tokenId);

    if (collection?.isFallback && !options?.allowFallback) {
      throw new Error("Fallback collection data not acceptable");
    }

    return collection;
  }

  public static async getTokensMetadata(
    tokens: { contract: string; tokenId: string }[],
    method = ""
  ): Promise<TokenMetadata[]> {
    method = method === "" ? config.metadataIndexingMethod : method;

    if (!MetadataProvidersMap[method]) {
      throw new Error(`Metadata provider ${method} not found`);
    }
    return await MetadataProvidersMap[method].getTokensMetadata(tokens);
  }

  public static getCollectionIndexingMethod(community: string | null) {
    switch (community) {
      case "sound.xyz":
        return "soundxyz";
    }

    return config.metadataIndexingMethodCollection;
  }
}

export { MetadataProviderRouter as default };
