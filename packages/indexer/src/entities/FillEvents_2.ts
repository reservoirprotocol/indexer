import { Column, Entity, Index } from "typeorm";

@Index(
  "fill_events_2_updated_at_tx_hash_index",
  ["batchIndex", "logIndex", "txHash", "updatedAt"],
  {}
)
@Index("fill_events_2_pk", ["batchIndex", "blockHash", "logIndex", "txHash"], {
  unique: true,
})
@Index(
  "fill_events_2_timestamp_log_index_batch_index_index",
  ["batchIndex", "logIndex", "timestamp"],
  {}
)
@Index(
  "fill_events_2_created_at_tx_hash_log_index_batch_index_index",
  ["batchIndex", "createdAt", "logIndex", "txHash"],
  {}
)
@Index(
  "fill_events_2_contract_token_id_is_deleted_timestamp_log_index_",
  ["batchIndex", "contract", "isDeleted", "logIndex", "timestamp", "tokenId"],
  {}
)
@Index(
  "fill_events_2_contract_is_deleted_timestamp_log_index_batch_ind",
  ["batchIndex", "contract", "isDeleted", "logIndex", "timestamp"],
  {}
)
@Index("fill_events_2_block_block_hash_index", ["block", "blockHash"], {})
@Index("fill_events_2_contract_is_deleted_price_index", ["contract", "isDeleted", "price"], {})
@Index("fill_events_2_maker_taker_contract", ["contract", "maker", "taker"], {})
@Index("fill_events_2_order_id_timestamp_index", ["orderId", "timestamp"], {})
@Index("fill_events_2_taker_index", ["taker"], {})
@Entity("fill_events_2", { schema: "public" })
export class FillEvents_2 {
  @Column("bytea", { name: "address" })
  address: Buffer;

  @Column("integer", { name: "block" })
  block: number;

  @Column("bytea", { primary: true, name: "block_hash" })
  blockHash: Buffer;

  @Column("bytea", { primary: true, name: "tx_hash" })
  txHash: Buffer;

  @Column("integer", { name: "tx_index" })
  txIndex: number;

  @Column("integer", { primary: true, name: "log_index" })
  logIndex: number;

  @Column("integer", { name: "timestamp" })
  timestamp: number;

  @Column("integer", { primary: true, name: "batch_index" })
  batchIndex: number;

  @Column("enum", {
    name: "order_kind",
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
  orderKind:
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

  @Column("text", { name: "order_id", nullable: true })
  orderId: string | null;

  @Column("enum", { name: "order_side", enum: ["buy", "sell", "bundle"] })
  orderSide: "buy" | "sell" | "bundle";

  @Column("bytea", { name: "maker" })
  maker: Buffer;

  @Column("bytea", { name: "taker" })
  taker: Buffer;

  @Column("numeric", { name: "price", precision: 78, scale: 0 })
  price: string;

  @Column("bytea", { name: "contract" })
  contract: Buffer;

  @Column("numeric", { name: "token_id", precision: 78, scale: 0 })
  tokenId: string;

  @Column("numeric", { name: "amount", precision: 78, scale: 0 })
  amount: string;

  @Column("enum", {
    name: "fill_source",
    nullable: true,
    enum: ["reservoir", "gem", "genie"],
  })
  fillSource: "reservoir" | "gem" | "genie" | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("integer", { name: "order_source_id_int", nullable: true })
  orderSourceIdInt: number | null;

  @Column("integer", { name: "fill_source_id", nullable: true })
  fillSourceId: number | null;

  @Column("integer", { name: "aggregator_source_id", nullable: true })
  aggregatorSourceId: number | null;

  @Column("double precision", {
    name: "wash_trading_score",
    nullable: true,
    precision: 53,
  })
  washTradingScore: number | null;

  @Column("bytea", {
    name: "currency",
    default: () => "'\x0000000000000000000000000000000000000000'",
  })
  currency: Buffer;

  @Column("numeric", { name: "currency_price", nullable: true })
  currencyPrice: string | null;

  @Column("numeric", { name: "usd_price", nullable: true })
  usdPrice: string | null;

  @Column("timestamp with time zone", {
    name: "updated_at",
    default: () => "now()",
  })
  updatedAt: Date;

  @Column("boolean", { name: "is_primary", nullable: true })
  isPrimary: boolean | null;

  @Column("integer", { name: "royalty_fee_bps", nullable: true })
  royaltyFeeBps: number | null;

  @Column("integer", { name: "marketplace_fee_bps", nullable: true })
  marketplaceFeeBps: number | null;

  @Column("jsonb", { name: "royalty_fee_breakdown", nullable: true })
  royaltyFeeBreakdown: object | null;

  @Column("jsonb", { name: "marketplace_fee_breakdown", nullable: true })
  marketplaceFeeBreakdown: object | null;

  @Column("boolean", { name: "paid_full_royalty", nullable: true })
  paidFullRoyalty: boolean | null;

  @Column("numeric", {
    name: "net_amount",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  netAmount: string | null;

  @Column("integer", { name: "is_deleted", default: () => "0" })
  isDeleted: number;

  @Column("text", { name: "comment", nullable: true })
  comment: string | null;
}
