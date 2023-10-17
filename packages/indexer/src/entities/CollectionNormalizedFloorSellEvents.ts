import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index(
  "collection_normalized_floor_sell_events_collection_id_created_a",
  ["collectionId", "createdAt", "id"],
  {}
)
@Index("collection_normalized_floor_sell_events_created_at_id_index", ["createdAt", "id"], {})
@Index("collection_normalized_floor_sell_events_pk", ["id"], { unique: true })
@Entity("collection_normalized_floor_sell_events", { schema: "public" })
export class CollectionNormalizedFloorSellEvents {
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

  @Column("text", { name: "collection_id" })
  collectionId: string;

  @Column("bytea", { name: "contract", nullable: true })
  contract: Buffer | null;

  @Column("numeric", {
    name: "token_id",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  tokenId: string | null;

  @Column("text", { name: "order_id", nullable: true })
  orderId: string | null;

  @Column("integer", { name: "order_source_id_int", nullable: true })
  orderSourceIdInt: number | null;

  @Column("tstzrange", { name: "order_valid_between", nullable: true })
  orderValidBetween: string | null;

  @Column("bytea", { name: "maker", nullable: true })
  maker: Buffer | null;

  @Column("numeric", { name: "price", nullable: true, precision: 78, scale: 0 })
  price: string | null;

  @Column("numeric", {
    name: "previous_price",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  previousPrice: string | null;

  @Column("bytea", { name: "tx_hash", nullable: true })
  txHash: Buffer | null;

  @Column("integer", { name: "tx_timestamp", nullable: true })
  txTimestamp: number | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;
}
