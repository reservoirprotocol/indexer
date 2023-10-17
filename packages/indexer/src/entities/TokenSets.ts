import { Column, Entity, Index } from "typeorm";

@Index("token_sets_attribute_id_top_buy_value_index", ["attributeId", "topBuyValue"], {})
@Index("token_sets_collection_id_top_buy_value_index", ["collectionId", "topBuyValue"], {})
@Index("token_sets_pk", ["id", "schemaHash"], { unique: true })
@Entity("token_sets", { schema: "public" })
export class TokenSets {
  @Column("text", { primary: true, name: "id" })
  id: string;

  @Column("bytea", { primary: true, name: "schema_hash" })
  schemaHash: Buffer;

  @Column("jsonb", { name: "schema", nullable: true })
  schema: object | null;

  @Column("jsonb", { name: "metadata", nullable: true })
  metadata: object | null;

  @Column("text", { name: "collection_id", nullable: true })
  collectionId: string | null;

  @Column("bigint", { name: "attribute_id", nullable: true })
  attributeId: string | null;

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

  @Column("integer", { name: "last_buy_timestamp", nullable: true })
  lastBuyTimestamp: number | null;

  @Column("numeric", {
    name: "last_buy_value",
    nullable: true,
    precision: 78,
    scale: 0,
  })
  lastBuyValue: string | null;
}
