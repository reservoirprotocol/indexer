import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("attribute_keys_collection_id_rank_key_index", ["collectionId", "rank"], {})
@Index("attribute_keys_collection_id_key_unique_index", ["collectionId", "key"], { unique: true })
@Index("attribute_keys_updated_at_id_index", ["id", "updatedAt"], {})
@Index("attribute_keys_pk", ["id"], { unique: true })
@Entity("attribute_keys", { schema: "public" })
export class AttributeKeys {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: string;

  @Column("text", { name: "collection_id" })
  collectionId: string;

  @Column("text", { name: "key" })
  key: string;

  @Column("enum", { name: "kind", enum: ["string", "number", "date", "range"] })
  kind: "string" | "number" | "date" | "range";

  @Column("integer", { name: "rank", nullable: true })
  rank: number | null;

  @Column("integer", { name: "attribute_count", default: () => "0" })
  attributeCount: number;

  @Column("jsonb", { name: "info", nullable: true })
  info: object | null;

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
