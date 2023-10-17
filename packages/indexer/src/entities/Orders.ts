import { Column, Entity, Index } from "typeorm";

@Index(
  "orders_not_expired_maker_side_created_at_id_index",
  ["approvalStatus", "createdAt", "id", "maker", "side"],
  {}
)
@Index("orders_maker_side_conduit_index", ["conduit", "maker", "side"], {})
@Index(
  "orders_side_value_source_id_int_contract_index",
  ["contract", "side", "sourceIdInt", "value"],
  {}
)
@Index("orders_side_contract_created_at_id_index", ["contract", "createdAt", "id", "side"], {})
@Index("orders_side_contract_updated_at_index", ["contract", "id", "side", "updatedAt"], {})
@Index("orders_side_contract_created_at_index", ["contract", "createdAt", "id", "side"], {})
@Index(
  "orders_token_set_id_source_id_int_side_created_at_index",
  ["createdAt", "side", "sourceIdInt", "tokenSetId"],
  {}
)
@Index("orders_created_at", ["createdAt"], {})
@Index("orders_side_created_at_id_index", ["createdAt", "id", "side"], {})
@Index("orders_maker_side_token_set_id_index", ["id", "maker", "side", "tokenSetId"], {})
@Index("orders_pk", ["id"], { unique: true })
@Index("orders_asks_updated_at_asc_id_index", ["id", "updatedAt"], {})
@Index("orders_bids_updated_at_asc_id_index", ["id", "updatedAt"], {})
@Index("orders_conversion_index", ["id"], {})
@Index("orders_dynamic_index", ["id"], {})
@Index(
  "orders_token_set_id_side_value_maker_index",
  ["id", "maker", "side", "tokenSetId", "value"],
  {}
)
@Index("orders_updated_at_asc_id_active_index", ["id", "side", "updatedAt"], {})
@Index("orders_updated_at_id_index", ["id", "updatedAt"], {})
@Index("orders_upper_valid_between_index", ["id"], {})
@Index("orders_expired_bids_updated_at_id_index", ["id", "updatedAt"], {})
@Index("orders_kind_maker_nonce_full_index", ["kind", "maker", "nonce"], {})
@Entity("orders", { schema: "public" })
export class Orders {
  @Column("text", { primary: true, name: "id" })
  id: string;

  @Column("enum", {
    name: "kind",
    enum: [
      "wyvern-v2",
      "wyvern-v2.3",
      "looks-rare",
      "opendao-erc721",
      "opendao-erc1155",
      "zeroex-v4-erc721",
      "zeroex-v4-erc1155",
      "foundation",
      "x2y2",
      "seaport",
      "rarible",
      "element-erc721",
      "element-erc1155",
      "quixotic",
      "nouns",
      "cryptopunks",
      "zora-v3",
      "mint",
      "universe",
      "sudoswap",
      "nftx",
      "blur",
      "forward",
      "manifold",
      "tofu-nft",
      "nft-trader",
      "decentraland",
      "okex",
      "bend-dao",
      "superrare",
      "infinity",
      "flow",
      "seaport-v1.2",
      "zeroex-v2",
      "seaport-v1.3",
      "seaport-v1.4",
      "treasure",
      "zeroex-v3",
      "looks-rare-v2",
      "alienswap",
      "seaport-v1.5",
      "blend",
      "collectionxyz",
      "sudoswap-v2",
      "payment-processor",
      "blur-v2",
      "caviar-v1",
      "midaswap",
      "joepeg",
    ],
  })
  kind:
    | "wyvern-v2"
    | "wyvern-v2.3"
    | "looks-rare"
    | "opendao-erc721"
    | "opendao-erc1155"
    | "zeroex-v4-erc721"
    | "zeroex-v4-erc1155"
    | "foundation"
    | "x2y2"
    | "seaport"
    | "rarible"
    | "element-erc721"
    | "element-erc1155"
    | "quixotic"
    | "nouns"
    | "cryptopunks"
    | "zora-v3"
    | "mint"
    | "universe"
    | "sudoswap"
    | "nftx"
    | "blur"
    | "forward"
    | "manifold"
    | "tofu-nft"
    | "nft-trader"
    | "decentraland"
    | "okex"
    | "bend-dao"
    | "superrare"
    | "infinity"
    | "flow"
    | "seaport-v1.2"
    | "zeroex-v2"
    | "seaport-v1.3"
    | "seaport-v1.4"
    | "treasure"
    | "zeroex-v3"
    | "looks-rare-v2"
    | "alienswap"
    | "seaport-v1.5"
    | "blend"
    | "collectionxyz"
    | "sudoswap-v2"
    | "payment-processor"
    | "blur-v2"
    | "caviar-v1"
    | "midaswap"
    | "joepeg";

  @Column("enum", {
    name: "side",
    nullable: true,
    enum: ["buy", "sell", "bundle"],
  })
  side: "buy" | "sell" | "bundle" | null;

  @Column("enum", {
    name: "fillability_status",
    nullable: true,
    enum: ["fillable", "no-balance", "cancelled", "filled", "expired"],
  })
  fillabilityStatus: "fillable" | "no-balance" | "cancelled" | "filled" | "expired" | null;

  @Column("enum", {
    name: "approval_status",
    nullable: true,
    enum: ["approved", "no-approval", "disabled"],
  })
  approvalStatus: "approved" | "no-approval" | "disabled" | null;

  @Column("text", { name: "token_set_id", nullable: true })
  tokenSetId: string | null;

  @Column("bytea", { name: "token_set_schema_hash", nullable: true })
  tokenSetSchemaHash: Buffer | null;

  @Column("bytea", { name: "maker", nullable: true })
  maker: Buffer | null;

  @Column("bytea", { name: "taker", nullable: true })
  taker: Buffer | null;

  @Column("numeric", { name: "price", nullable: true, precision: 78, scale: 0 })
  price: string | null;

  @Column("numeric", { name: "value", nullable: true, precision: 78, scale: 0 })
  value: string | null;

  @Column("numeric", {
    name: "quantity_filled",
    nullable: true,
    precision: 78,
    scale: 0,
    default: () => "0",
  })
  quantityFilled: string | null;

  @Column("numeric", {
    name: "quantity_remaining",
    nullable: true,
    precision: 78,
    scale: 0,
    default: () => "1",
  })
  quantityRemaining: string | null;

  @Column("tstzrange", { name: "valid_between", nullable: true })
  validBetween: string | null;

  @Column("numeric", { name: "nonce", nullable: true, precision: 78, scale: 0 })
  nonce: string | null;

  @Column("integer", { name: "source_id_int", nullable: true })
  sourceIdInt: number | null;

  @Column("bytea", { name: "contract", nullable: true })
  contract: Buffer | null;

  @Column("bytea", { name: "conduit", nullable: true })
  conduit: Buffer | null;

  @Column("integer", { name: "fee_bps", nullable: true })
  feeBps: number | null;

  @Column("jsonb", { name: "fee_breakdown", nullable: true })
  feeBreakdown: object | null;

  @Column("boolean", { name: "dynamic", nullable: true })
  dynamic: boolean | null;

  @Column("jsonb", { name: "raw_data", nullable: true })
  rawData: object | null;

  @Column("boolean", { name: "is_reservoir", nullable: true })
  isReservoir: boolean | null;

  @Column("timestamp with time zone", { name: "expiration", nullable: true })
  expiration: Date | null;

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

  @Column("bytea", {
    name: "currency",
    default: () => "'\x0000000000000000000000000000000000000000'",
  })
  currency: Buffer;

  @Column("numeric", {
    name: "currency_price",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  currencyPrice: string | null;

  @Column("numeric", {
    name: "currency_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  currencyValue: string | null;

  @Column("boolean", { name: "needs_conversion", nullable: true })
  needsConversion: boolean | null;

  @Column("jsonb", { name: "missing_royalties", nullable: true })
  missingRoyalties: object | null;

  @Column("numeric", {
    name: "normalized_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  normalizedValue: string | null;

  @Column("numeric", {
    name: "currency_normalized_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  currencyNormalizedValue: string | null;

  @Column("timestamp with time zone", { name: "originated_at", nullable: true })
  originatedAt: Date | null;

  @Column("integer", { name: "block_number", nullable: true })
  blockNumber: number | null;

  @Column("integer", { name: "log_index", nullable: true })
  logIndex: number | null;
}
