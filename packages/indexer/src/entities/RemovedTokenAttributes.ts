import { Column, Entity, Index } from "typeorm";

@Index(
  "removed_token_attributes_deleted_at_contract_token_id_attribute",
  ["attributeId", "contract", "deletedAt", "tokenId"],
  {}
)
@Index("removed_token_attributes_pk", ["attributeId", "contract", "tokenId"], {
  unique: true,
})
@Entity("removed_token_attributes", { schema: "public" })
export class RemovedTokenAttributes {
  @Column("bytea", { primary: true, name: "contract" })
  contract: Buffer;

  @Column("numeric", {
    primary: true,
    name: "token_id",
    precision: 78,
    scale: 0,
  })
  tokenId: string;

  @Column("bigint", { primary: true, name: "attribute_id" })
  attributeId: string;

  @Column("text", { name: "collection_id" })
  collectionId: string;

  @Column("text", { name: "key" })
  key: string;

  @Column("text", { name: "value" })
  value: string;

  @Column("timestamp with time zone", { name: "created_at" })
  createdAt: Date;

  @Column("timestamp with time zone", {
    name: "deleted_at",
    default: () => "now()",
  })
  deletedAt: Date;
}
