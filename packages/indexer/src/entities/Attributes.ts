import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("attributes_attribute_key_id_value_unique_index", ["attributeKeyId", "value"], {
  unique: true,
})
@Index(
  "attributes_key_collection_id_floor_sell_value_index",
  ["collectionId", "floorSellValue", "key"],
  {}
)
@Index("attributes_collection_id_floor_sell_value_index", ["collectionId", "floorSellValue"], {})
@Index("attributes_pk", ["id"], { unique: true })
@Index("attributes_updated_at_id_index", ["id", "updatedAt"], {})
@Entity("attributes")
export class Attributes {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: string;

  @Column("integer", { name: "attribute_key_id" })
  attributeKeyId: number;

  @Column("text", { name: "value" })
  value: string;

  @Column("integer", { name: "token_count", default: () => "0" })
  tokenCount: number;

  @Column("integer", { name: "on_sale_count", default: () => "0" })
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
}
