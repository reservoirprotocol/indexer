import { Column, Entity, Index } from "typeorm";

@Index("removed_attribute_keys_deleted_at_id_index", ["deletedAt", "id"], {})
@Index("removed_attribute_keys_pk", ["id"], { unique: true })
@Entity("removed_attribute_keys")
export class RemovedAttributeKeys {
  @Column("bigint", { primary: true, name: "id" })
  id: string;

  @Column("text", { name: "collection_id" })
  collectionId: string;

  @Column("text", { name: "key" })
  key: string;

  @Column("enum", { name: "kind", enum: ["string", "number", "date", "range"] })
  kind: "string" | "number" | "date" | "range";

  @Column("integer", { name: "rank", nullable: true })
  rank: number | null;

  @Column("integer", { name: "attribute_count" })
  attributeCount: number;

  @Column("jsonb", { name: "info", nullable: true })
  info: object | null;

  @Column("timestamp with time zone", { name: "created_at" })
  createdAt: Date;

  @Column("timestamp with time zone", {
    name: "deleted_at",
    default: () => "now()",
  })
  deletedAt: Date;
}
