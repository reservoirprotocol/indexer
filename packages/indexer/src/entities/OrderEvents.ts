import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("order_events_contract_created_at_id_index", ["contract", "createdAt", "id"], {})
@Index("order_events_created_at_id_index", ["createdAt", "id"], {})
@Index("order_events_pk", ["id"], { unique: true })
@Index("order_events_order_id_index", ["orderId"], {})
@Entity("order_events", { schema: "public" })
export class OrderEvents {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: string;

  @Column("enum", {
    name: "kind",
    enum: [
      "bootstrap",
      "new-order",
      "expiry",
      "sale",
      "cancel",
      "balance-change",
      "approval-change",
      "revalidation",
      "reprice",
    ],
  })
  kind:
    | "bootstrap"
    | "new-order"
    | "expiry"
    | "sale"
    | "cancel"
    | "balance-change"
    | "approval-change"
    | "revalidation"
    | "reprice";

  @Column("enum", {
    name: "status",
    enum: ["active", "inactive", "filled", "cancelled", "expired"],
  })
  status: "active" | "inactive" | "filled" | "cancelled" | "expired";

  @Column("bytea", { name: "contract" })
  contract: Buffer;

  @Column("numeric", { name: "token_id", precision: 78, scale: 0 })
  tokenId: string;

  @Column("text", { name: "order_id" })
  orderId: string;

  @Column("bytea", { name: "order_source_id", nullable: true })
  orderSourceId: Buffer | null;

  @Column("integer", { name: "order_source_id_int", nullable: true })
  orderSourceIdInt: number | null;

  @Column("tstzrange", { name: "order_valid_between", nullable: true })
  orderValidBetween: string | null;

  @Column("numeric", {
    name: "order_quantity_remaining",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  orderQuantityRemaining: string | null;

  @Column("bytea", { name: "maker", nullable: true })
  maker: Buffer | null;

  @Column("numeric", { name: "price", nullable: true, precision: 78, scale: 0 })
  price: string | null;

  @Column("bytea", { name: "tx_hash", nullable: true })
  txHash: Buffer | null;

  @Column("integer", { name: "tx_timestamp", nullable: true })
  txTimestamp: number | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;

  @Column("numeric", {
    name: "order_nonce",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  orderNonce: string | null;

  @Column("enum", {
    name: "order_kind",
    nullable: true,
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
    | "joepeg"
    | null;

  @Column("text", { name: "order_token_set_id", nullable: true })
  orderTokenSetId: string | null;

  @Column("boolean", { name: "order_dynamic", nullable: true })
  orderDynamic: boolean | null;

  @Column("bytea", { name: "order_currency", nullable: true })
  orderCurrency: Buffer | null;

  @Column("numeric", {
    name: "order_currency_price",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  orderCurrencyPrice: string | null;

  @Column("numeric", {
    name: "order_normalized_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  orderNormalizedValue: string | null;

  @Column("numeric", {
    name: "order_currency_normalized_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  orderCurrencyNormalizedValue: string | null;

  @Column("jsonb", { name: "order_raw_data", nullable: true })
  orderRawData: object | null;
}
