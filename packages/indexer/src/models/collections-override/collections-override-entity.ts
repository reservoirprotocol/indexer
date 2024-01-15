import _ from "lodash";

export type CollectionsOverrideMetadata = {
  name?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  twitterUrl?: string | null;
  discordUrl?: string | null;
  externalUrl?: string | null;
  bannerImageUrl?: string | null;
  creator?: string | null;
};

export type CollectionsOverrideRoyalties = {
  bps: number;
  recipient: string;
};

export type CollectionsOverrideEntityParams = {
  collection_id: string;
  metadata: CollectionsOverrideMetadata;
  royalties: CollectionsOverrideRoyalties[];
  created_at: string;
  updated_at: string;
};

export class CollectionsOverrideEntity {
  collectionId: string;
  override: {
    name?: string | null;
    metadata?: {
      description?: string | null;
      imageUrl?: string | null;
      twitterUrl?: string | null;
      discordUrl?: string | null;
      externalUrl?: string | null;
    };
    royalties?: CollectionsOverrideRoyalties[];
  };
  createdAt: string;
  updatedAt: string;

  constructor(params: CollectionsOverrideEntityParams) {
    this.collectionId = params.collection_id;
    this.override = params.metadata
      ? _.omitBy(
        {
          name: params.metadata?.name,
          metadata: _.omitBy(
            {
              description: params.metadata?.description,
              imageUrl: params.metadata?.imageUrl,
              twitterUrl: params.metadata?.twitterUrl,
              discordUrl: params.metadata?.discordUrl,
              externalUrl: params.metadata?.externalUrl,
            },
            _.isUndefined
          ),
          royalties: params.royalties ? params.royalties : undefined,
        },
        _.isUndefined
      )
      : {};
    this.createdAt = params.created_at;
    this.updatedAt = params.updated_at;
  }
}
