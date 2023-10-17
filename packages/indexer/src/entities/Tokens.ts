import { Column, Entity, Index } from "typeorm";

@Index("tokens_collection_id_is_flagged_index", ["collectionId", "isFlagged", "tokenId"], {})
@Index(
  "tokens_collection_id_normalized_floor_sell_value_token_id_index",
  ["collectionId", "normalizedFloorSellValue", "tokenId"],
  {}
)
@Index(
  "tokens_updated_at_collection_id_token_id_index",
  ["collectionId", "tokenId", "updatedAt"],
  {}
)
@Index(
  "tokens_collection_id_rarity_rank_token_id_index",
  ["collectionId", "rarityRank", "tokenId"],
  {}
)
@Index("tokens_collection_id_contract_token_id_index", ["collectionId", "contract", "tokenId"], {})
@Index(
  "tokens_collection_id_floor_sell_value_token_id_index",
  ["collectionId", "floorSellValue", "tokenId"],
  {}
)
@Index(
  "tokens_contract_floor_sell_value_floor_sell_currency_index",
  ["contract", "floorSellCurrency", "floorSellValue"],
  {}
)
@Index(
  "tokens_contract_token_id_index",
  ["contract", "floorSellValue", "tokenId", "topBuyValue"],
  {}
)
@Index("tokens_contract_updated_at_token_id_index", ["contract", "tokenId", "updatedAt"], {})
@Index("tokens_contract_floor_sell_value_index", ["contract", "floorSellValue"], {})
@Index("tokens_updated_at_contract_token_id_index", ["contract", "tokenId", "updatedAt"], {})
@Index(
  "tokens_contract_floor_sell_value_token_id_index",
  ["contract", "floorSellValue", "tokenId"],
  {}
)
@Index("tokens_pk", ["contract", "tokenId"], { unique: true })
@Index("tokens_last_flag_change_is_flagged_index", ["isFlagged", "lastFlagChange"], {})
@Entity("tokens", { schema: "public" })
export class Tokens {
  @Column("bytea", { primary: true, name: "contract" })
  contract: Buffer;

  @Column("numeric", {
    primary: true,
    name: "token_id",
    precision: 78,
    scale: 0,
  })
  tokenId: string;

  @Column("text", { name: "name", nullable: true })
  name: string | null;

  @Column("text", { name: "description", nullable: true })
  description: string | null;

  @Column("text", { name: "image", nullable: true })
  image: string | null;

  @Column("text", { name: "media", nullable: true })
  media: string | null;

  @Column("text", { name: "collection_id", nullable: true })
  collectionId: string | null;

  @Column("hstore", { name: "attributes", nullable: true })
  attributes: string | null;

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

  @Column("integer", { name: "floor_sell_valid_from", nullable: true })
  floorSellValidFrom: number | null;

  @Column("integer", { name: "floor_sell_valid_to", nullable: true })
  floorSellValidTo: number | null;

  @Column("bytea", { name: "floor_sell_source_id", nullable: true })
  floorSellSourceId: Buffer | null;

  @Column("integer", { name: "floor_sell_source_id_int", nullable: true })
  floorSellSourceIdInt: number | null;

  @Column("boolean", { name: "floor_sell_is_reservoir", nullable: true })
  floorSellIsReservoir: boolean | null;

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

  @Column("integer", { name: "last_sell_timestamp", nullable: true })
  lastSellTimestamp: number | null;

  @Column("numeric", {
    name: "last_sell_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  lastSellValue: string | null;

  @Column("integer", { name: "last_buy_timestamp", nullable: true })
  lastBuyTimestamp: number | null;

  @Column("numeric", {
    name: "last_buy_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  lastBuyValue: string | null;

  @Column("timestamp with time zone", {
    name: "last_metadata_sync",
    nullable: true,
  })
  lastMetadataSync: Date | null;

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

  @Column("double precision", {
    name: "rarity_score",
    nullable: true,
    precision: 53,
  })
  rarityScore: number | null;

  @Column("integer", { name: "rarity_rank", nullable: true })
  rarityRank: number | null;

  @Column("integer", { name: "is_flagged", nullable: true, default: () => "0" })
  isFlagged: number | null;

  @Column("timestamp with time zone", {
    name: "last_flag_update",
    nullable: true,
  })
  lastFlagUpdate: Date | null;

  @Column("bytea", { name: "floor_sell_currency", nullable: true })
  floorSellCurrency: Buffer | null;

  @Column("numeric", {
    name: "floor_sell_currency_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  floorSellCurrencyValue: string | null;

  @Column("integer", { name: "minted_timestamp", nullable: true })
  mintedTimestamp: number | null;

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

  @Column("integer", {
    name: "normalized_floor_sell_valid_from",
    nullable: true,
  })
  normalizedFloorSellValidFrom: number | null;

  @Column("integer", { name: "normalized_floor_sell_valid_to", nullable: true })
  normalizedFloorSellValidTo: number | null;

  @Column("integer", {
    name: "normalized_floor_sell_source_id_int",
    nullable: true,
  })
  normalizedFloorSellSourceIdInt: number | null;

  @Column("boolean", {
    name: "normalized_floor_sell_is_reservoir",
    nullable: true,
  })
  normalizedFloorSellIsReservoir: boolean | null;

  @Column("bytea", { name: "normalized_floor_sell_currency", nullable: true })
  normalizedFloorSellCurrency: Buffer | null;

  @Column("numeric", {
    name: "normalized_floor_sell_currency_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  normalizedFloorSellCurrencyValue: string | null;

  @Column("timestamp with time zone", {
    name: "last_flag_change",
    nullable: true,
  })
  lastFlagChange: Date | null;

  @Column("numeric", {
    name: "supply",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  supply: string | null;

  @Column("numeric", {
    name: "remaining_supply",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  remainingSupply: string | null;

  @Column("jsonb", { name: "metadata", nullable: true })
  metadata: object | null;

  @Column("timestamp with time zone", {
    name: "metadata_indexed_at",
    nullable: true,
  })
  metadataIndexedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "metadata_initialized_at",
    nullable: true,
  })
  metadataInitializedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "metadata_changed_at",
    nullable: true,
  })
  metadataChangedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "metadata_updated_at",
    nullable: true,
  })
  metadataUpdatedAt: Date | null;
}
