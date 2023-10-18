import { Column, Entity, Index } from "typeorm";

@Index("erc721c_operator_whitelists_pk", ["id", "transferValidator"], {
  unique: true,
})
@Entity("erc721c_operator_whitelists")
export class Erc721cOperatorWhitelists {
  @Column("bytea", { primary: true, name: "transfer_validator" })
  transferValidator: Buffer;

  @Column("integer", { primary: true, name: "id" })
  id: number;

  @Column("jsonb", { name: "whitelist" })
  whitelist: object;
}
