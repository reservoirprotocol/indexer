/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TokenMetadata {
  contract: string;
  // TODO: standardize as string or number throughout the indexer
  tokenId: any;
  slug: string | null;
  collection: string;
  flagged: boolean | null;
  name?: string;
  description?: string;
  originalMetadata?: JSON;
  imageUrl?: string | null;
  imageOriginalUrl?: string;
  imageProperties?: {
    width?: number;
    height?: number;
    size?: number;
    mime_type?: string;
  };
  animationOriginalUrl?: string;
  metadataOriginalUrl?: string;
  mediaUrl?: string | null;
  attributes: {
    key: string;
    value: string | number | null;
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

export type ProviderMethod = "opensea" | "onchain" | "simplehash";

export interface SocialUrls {
  [key: string]: string;
}

export interface Collection {
  social_urls?: SocialUrls;
  [key: string]: any;
}

export interface Metadata {
  discordUrl?: string;
  twitterUsername?: string;
  twitterUrl?: string;
  telegramUrl?: string;
  instagramUrl?: string;
  mediumUrl?: string;
  githubUrl?: string;
  externalUrl?: string;
  imageUrl?: string;
  bannerImageUrl?: string;
  safelistRequestStatus?: string;
  name?: string;
  description?: string;
}

export type MapEntry = {
  key: keyof Metadata;
  normalize?: (value: string) => string;
};
