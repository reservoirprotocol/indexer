import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("collection_mints_unique_index", ["collectionId", "stage"], {
  unique: true,
})
@Index("collection_mints_expired_index", ["endTime"], {})
@Index("collection_mints_pk", ["id"], { unique: true })
@Entity("collection_mints", { schema: "public" })
export class CollectionMints {
  @Column("text", { name: "collection_id" })
  collectionId: string;

  @Column("enum", {
    name: "kind",
    nullable: true,
    enum: ["public", "zora", "allowlist"],
  })
  kind: "public" | "zora" | "allowlist" | null;

  @Column("enum", { name: "status", nullable: true, enum: ["open", "closed"] })
  status: "open" | "closed" | null;

  @Column("jsonb", { name: "details", nullable: true })
  details: object | null;

  @Column("bytea", { name: "currency" })
  currency: Buffer;

  @Column("numeric", { name: "price", nullable: true, precision: 78, scale: 0 })
  price: string | null;

  @Column("text", { name: "stage", default: () => "'public-sale'" })
  stage: string;

  @Column("numeric", {
    name: "max_mints_per_wallet",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  maxMintsPerWallet: string | null;

  @Column("timestamp with time zone", { name: "start_time", nullable: true })
  startTime: Date | null;

  @Column("timestamp with time zone", { name: "end_time", nullable: true })
  endTime: Date | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;

  @Column("timestamp with time zone", {
    name: "updated_at",
    default: () => "now()",
  })
  updatedAt: Date;

  @Column("numeric", {
    name: "max_supply",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  maxSupply: string | null;

  @Column("numeric", {
    name: "token_id",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  tokenId: string | null;

  @Column("text", { name: "allowlist_id", nullable: true })
  allowlistId: string | null;

  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: string;
}
