import { fromBuffer } from "@/common/utils";

export type CollectionsEntityUpdateParams = {
  id?: string;
  slug?: string;
  name?: string;
  metadata?: string;
  royalties?: string;
  community?: string;
  contract?: string;
  tokenIdRange?: string;
  tokenSetId?: string;
  nonFlaggedTokenSetId?: string | null;
  tokenCount?: number;
  createdAt?: string;
  updatedAt?: string;
  day1Volume?: number;
  day1Rank?: number;
  day7Volume?: number;
  day7Rank?: number;
  day30Volume?: number;
  day30Rank?: number;
  allTimeVolume?: number;
  allTimeRank?: number;
  indexMetadata?: boolean;
  lastMetadataSync?: string;
};

export type CollectionsMetadata = {
  imageUrl?: string | undefined;
  discordUrl?: string | undefined;
  description?: string | undefined;
  externalUrl?: string | undefined;
  bannerImageUrl?: string | undefined;
  twitterUsername?: string | undefined;
  openseaVerificationStatus?: string | undefined;
};

export type CollectionsEntityParams = {
  id: string;
  slug: string;
  name: string;
  metadata: CollectionsMetadata;
  royalties: Buffer;
  community: string;
  contract: Buffer;
  token_id_range: string;
  token_set_id: string;
  non_flagged_token_set_id: string;
  token_count: number;
  created_at: string;
  updated_at: string;
  day1_volume: number;
  day1_rank: number;
  day7_volume: number;
  day7_rank: number;
  day30_volume: number;
  day30_rank: number;
  all_time_volume: number;
  all_time_rank: number;
  index_metadata: boolean;
  last_metadata_sync: string;
  minted_timestamp: number;
};

export class CollectionsEntity {
  id: string;
  slug: string;
  name: string;
  metadata: CollectionsMetadata;
  royalties: string;
  community: string;
  contract: string;
  tokenIdRange: number[];
  tokenSetId: string;
  nonFlaggedTokenSetId: string;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
  day1Volume: number;
  day1Rank: number;
  day7Volume: number;
  day7Rank: number;
  day30Volume: number;
  day30Rank: number;
  allTimeVolume: number;
  allTimeRank: number;
  indexMetadata: boolean;
  lastMetadataSync: string;
  mintedTimestamp: number;

  constructor(params: CollectionsEntityParams) {
    this.id = params.id;
    this.slug = params.slug;
    this.name = params.name;
    this.metadata = params.metadata;
    this.royalties = params.royalties ? fromBuffer(params.royalties) : params.royalties;
    this.community = params.community;
    this.contract = fromBuffer(params.contract);
    this.tokenIdRange = params.token_id_range != "(,)" ? JSON.parse(params.token_id_range) : [];
    this.tokenSetId = params.token_set_id;
    this.nonFlaggedTokenSetId = params.non_flagged_token_set_id;
    this.tokenCount = params.token_count;
    this.createdAt = params.created_at;
    this.updatedAt = params.updated_at;
    this.day1Volume = params.day1_volume;
    this.day1Rank = params.day1_rank;
    this.day7Volume = params.day7_volume;
    this.day7Rank = params.day7_rank;
    this.day30Volume = params.day30_volume;
    this.day30Rank = params.day30_rank;
    this.allTimeVolume = params.all_time_volume;
    this.allTimeRank = params.all_time_rank;
    this.indexMetadata = params.index_metadata;
    this.lastMetadataSync = params.last_metadata_sync;
    this.mintedTimestamp = params.minted_timestamp;
  }
}
