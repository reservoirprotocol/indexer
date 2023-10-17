import { Column, Entity, Index } from "typeorm";

@Index("removed_attributes_deleted_at_id_index", ["deletedAt", "id"], {})
@Index("removed_attributes_pk", ["id"], { unique: true })
@Entity("removed_attributes", { schema: "public" })
export class RemovedAttributes {
  @Column("bigint", { primary: true, name: "id" })
  id: string;

  @Column("integer", { name: "attribute_key_id" })
  attributeKeyId: number;

  @Column("text", { name: "value" })
  value: string;

  @Column("integer", { name: "token_count" })
  tokenCount: number;

  @Column("integer", { name: "on_sale_count" })
  onSaleCount: number;

  @Column("numeric", {
    name: "floor_sell_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  floorSellValue: string | null;

  @Column("numeric", {
    name: "top_buy_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  topBuyValue: string | null;

  @Column("timestamp with time zone", {
    name: "sell_updated_at",
    nullable: true,
  })
  sellUpdatedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "buy_updated_at",
    nullable: true,
  })
  buyUpdatedAt: Date | null;

  @Column("text", { name: "sample_images", nullable: true, array: true })
  sampleImages: string[] | null;

  @Column("text", { name: "collection_id", nullable: true })
  collectionId: string | null;

  @Column("enum", {
    name: "kind",
    nullable: true,
    enum: ["string", "number", "date", "range"],
  })
  kind: "string" | "number" | "date" | "range" | null;

  @Column("text", { name: "key", nullable: true })
  key: string | null;

  @Column("timestamp with time zone", { name: "created_at" })
  createdAt: Date;

  @Column("timestamp with time zone", {
    name: "deleted_at",
    default: () => "now()",
  })
  deletedAt: Date;
}
