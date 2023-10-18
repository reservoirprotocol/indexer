import { Column, Entity, Index } from "typeorm";

@Index("collections_all_time_volume_index", ["allTimeVolume"], {})
@Index("collections_community_index", ["community"], {})
@Index("collections_contract_token_id_range_index", ["contract", "id", "tokenIdRange"], {})
@Index("collections_created_at_index", ["createdAt"], {})
@Index("collections_day1_volume_index", ["day1Volume"], {})
@Index("collections_day30_volume_index", ["day30Volume"], {})
@Index("collections_day7_volume_index", ["day7Volume"], {})
@Index("collections_floor_sell_value_index", ["floorSellValue", "id"], {})
@Index("collections_updated_at_id_index", ["id", "updatedAt"], {})
@Index("collections_pk", ["id"], { unique: true })
@Index("collections_minted_timestamp_index", ["mintedTimestamp"], {})
@Index("collections_name_index", ["name"], {})
@Index("collections_slug_index", ["slug"], {})
@Entity("collections")
export class Collections {
  @Column("text", { primary: true, name: "id" })
  id: string;

  @Column("text", { name: "slug", nullable: true })
  slug: string | null;

  @Column("text", { name: "name" })
  name: string;

  @Column("jsonb", { name: "metadata", nullable: true })
  metadata: object | null;

  @Column("jsonb", { name: "royalties", nullable: true })
  royalties: object | null;

  @Column("text", { name: "community", nullable: true })
  community: string | null;

  @Column("boolean", { name: "index_metadata", nullable: true })
  indexMetadata: boolean | null;

  @Column("bytea", { name: "contract" })
  contract: Buffer;

  @Column("numrange", { name: "token_id_range", nullable: true })
  tokenIdRange: string | null;

  @Column("text", { name: "token_set_id", nullable: true })
  tokenSetId: string | null;

  @Column("integer", { name: "token_count", default: () => "0" })
  tokenCount: number;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("timestamp with time zone", {
    name: "updated_at",
    nullable: true,
    default: () => "now()",
  })
  updatedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "last_metadata_sync",
    nullable: true,
  })
  lastMetadataSync: Date | null;

  @Column("integer", { name: "minted_timestamp", nullable: true })
  mintedTimestamp: number | null;

  @Column("text", { name: "floor_sell_id", nullable: true })
  floorSellId: string | null;

  @Column("numeric", {
    name: "floor_sell_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  floorSellValue: string | null;

  @Column("bytea", { name: "floor_sell_maker", nullable: true })
  floorSellMaker: Buffer | null;

  @Column("bytea", { name: "floor_sell_source_id", nullable: true })
  floorSellSourceId: Buffer | null;

  @Column("integer", { name: "floor_sell_source_id_int", nullable: true })
  floorSellSourceIdInt: number | null;

  @Column("tstzrange", { name: "floor_sell_valid_between", nullable: true })
  floorSellValidBetween: string | null;

  @Column("numeric", {
    name: "day1_volume",
    nullable: true,
    precision: 78,
    scale: 0,
    default: () => "0",
  })
  day1Volume: string | null;

  @Column("integer", { name: "day1_rank", nullable: true })
  day1Rank: number | null;

  @Column("numeric", {
    name: "day7_volume",
    nullable: true,
    precision: 78,
    scale: 0,
    default: () => "0",
  })
  day7Volume: string | null;

  @Column("integer", { name: "day7_rank", nullable: true })
  day7Rank: number | null;

  @Column("numeric", {
    name: "day30_volume",
    nullable: true,
    precision: 78,
    scale: 0,
    default: () => "0",
  })
  day30Volume: string | null;

  @Column("integer", { name: "day30_rank", nullable: true })
  day30Rank: number | null;

  @Column("numeric", {
    name: "all_time_volume",
    nullable: true,
    precision: 78,
    scale: 0,
    default: () => "0",
  })
  allTimeVolume: string | null;

  @Column("integer", { name: "all_time_rank", nullable: true })
  allTimeRank: number | null;

  @Column("double precision", {
    name: "day1_volume_change",
    nullable: true,
  })
  day1VolumeChange: number | null;

  @Column("double precision", {
    name: "day7_volume_change",
    nullable: true,
  })
  day7VolumeChange: number | null;

  @Column("double precision", {
    name: "day30_volume_change",
    nullable: true,
  })
  day30VolumeChange: number | null;

  @Column("numeric", {
    name: "day1_floor_sell_value",
    nullable: true,
    precision: 78,
    scale: 0,
    default: () => "NULL::numeric",
  })
  day1FloorSellValue: string | null;

  @Column("numeric", {
    name: "day7_floor_sell_value",
    nullable: true,
    precision: 78,
    scale: 0,
    default: () => "NULL::numeric",
  })
  day7FloorSellValue: string | null;

  @Column("numeric", {
    name: "day30_floor_sell_value",
    nullable: true,
    precision: 78,
    scale: 0,
    default: () => "NULL::numeric",
  })
  day30FloorSellValue: string | null;

  @Column("text", { name: "non_flagged_token_set_id", nullable: true })
  nonFlaggedTokenSetId: string | null;

  @Column("text", { name: "top_buy_id", nullable: true })
  topBuyId: string | null;

  @Column("numeric", {
    name: "top_buy_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  topBuyValue: string | null;

  @Column("bytea", { name: "top_buy_maker", nullable: true })
  topBuyMaker: Buffer | null;

  @Column("integer", { name: "top_buy_source_id_int", nullable: true })
  topBuySourceIdInt: number | null;

  @Column("tstzrange", { name: "top_buy_valid_between", nullable: true })
  topBuyValidBetween: string | null;

  @Column("jsonb", { name: "new_royalties", nullable: true })
  newRoyalties: object | null;

  @Column("text", { name: "normalized_floor_sell_id", nullable: true })
  normalizedFloorSellId: string | null;

  @Column("numeric", {
    name: "normalized_floor_sell_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  normalizedFloorSellValue: string | null;

  @Column("bytea", { name: "normalized_floor_sell_maker", nullable: true })
  normalizedFloorSellMaker: Buffer | null;

  @Column("tstzrange", {
    name: "normalized_floor_sell_valid_between",
    nullable: true,
  })
  normalizedFloorSellValidBetween: string | null;

  @Column("integer", {
    name: "normalized_floor_sell_source_id_int",
    nullable: true,
  })
  normalizedFloorSellSourceIdInt: number | null;

  @Column("integer", { name: "royalties_bps", nullable: true })
  royaltiesBps: number | null;

  @Column("text", { name: "non_flagged_floor_sell_id", nullable: true })
  nonFlaggedFloorSellId: string | null;

  @Column("numeric", {
    name: "non_flagged_floor_sell_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  nonFlaggedFloorSellValue: string | null;

  @Column("bytea", { name: "non_flagged_floor_sell_maker", nullable: true })
  nonFlaggedFloorSellMaker: Buffer | null;

  @Column("tstzrange", {
    name: "non_flagged_floor_sell_valid_between",
    nullable: true,
  })
  nonFlaggedFloorSellValidBetween: string | null;

  @Column("integer", {
    name: "non_flagged_floor_sell_source_id_int",
    nullable: true,
  })
  nonFlaggedFloorSellSourceIdInt: number | null;

  @Column("double precision", {
    name: "day0_volume_change",
    nullable: true,
  })
  day0VolumeChange: number | null;

  @Column("numeric", {
    name: "day0_floor_sell_value",
    nullable: true,
    precision: 78,
    scale: 0,
    default: () => "NULL::numeric",
  })
  day0FloorSellValue: string | null;

  @Column("integer", { name: "day0_rank", nullable: true })
  day0Rank: number | null;

  @Column("numeric", {
    name: "day0_volume",
    nullable: true,
    precision: 78,
    scale: 0,
    default: () => "0",
  })
  day0Volume: string | null;

  @Column("jsonb", { name: "marketplace_fees", nullable: true })
  marketplaceFees: object | null;

  @Column("integer", { name: "owner_count", nullable: true })
  ownerCount: number | null;

  @Column("jsonb", { name: "payment_tokens", nullable: true })
  paymentTokens: object | null;

  @Column("bytea", { name: "creator", nullable: true })
  creator: Buffer | null;

  @Column("integer", { name: "day1_sales_count", nullable: true })
  day1SalesCount: number | null;
}
