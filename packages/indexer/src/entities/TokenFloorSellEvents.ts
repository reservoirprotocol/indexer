import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index(
  "token_floor_sell_events_contract_token_id_created_at_id_index",
  ["contract", "createdAt", "id", "tokenId"],
  {}
)
@Index("token_floor_sell_events_contract_created_at_id_index", ["contract", "createdAt", "id"], {})
@Index("token_floor_sell_events_created_at_id_index", ["createdAt", "id"], {})
@Index("token_floor_sell_events_pk", ["id"], { unique: true })
@Entity("token_floor_sell_events", { schema: "public" })
export class TokenFloorSellEvents {
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

  @Column("bytea", { name: "contract" })
  contract: Buffer;

  @Column("numeric", { name: "token_id", precision: 78, scale: 0 })
  tokenId: string;

  @Column("text", { name: "order_id", nullable: true })
  orderId: string | null;

  @Column("bytea", { name: "maker", nullable: true })
  maker: Buffer | null;

  @Column("numeric", { name: "price", nullable: true, precision: 78, scale: 0 })
  price: string | null;

  @Column("integer", { name: "source_id_int", nullable: true })
  sourceIdInt: number | null;

  @Column("tstzrange", { name: "valid_between", nullable: true })
  validBetween: string | null;

  @Column("numeric", { name: "nonce", nullable: true, precision: 78, scale: 0 })
  nonce: string | null;

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
