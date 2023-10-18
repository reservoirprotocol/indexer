import { Column, Entity, Index } from "typeorm";

@Index(
  "token_attributes_attribute_id_contract_token_id_unique_index",
  ["attributeId", "contract", "tokenId"],
  { unique: true }
)
@Index(
  "token_attributes_updated_at_contract_token_id_attribute_id_inde",
  ["attributeId", "contract", "tokenId", "updatedAt"],
  {}
)
@Index("token_attributes_pk", ["attributeId", "contract", "tokenId"], {
  unique: true,
})
@Index(
  "token_attributes_collection_id_key_value_index",
  ["collectionId", "contract", "key", "tokenId", "value"],
  {}
)
@Index(
  "token_attributes_contract_token_id_key_value_index",
  ["contract", "key", "tokenId", "value"],
  {}
)
@Entity("token_attributes")
export class TokenAttributes {
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
