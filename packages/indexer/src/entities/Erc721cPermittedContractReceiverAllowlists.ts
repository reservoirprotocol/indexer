import { Column, Entity, Index } from "typeorm";

@Index("erc721c_permitted_contract_receiver_allowlists_pk", ["id", "transferValidator"], {
  unique: true,
})
@Entity("erc721c_permitted_contract_receiver_allowlists")
export class Erc721cPermittedContractReceiverAllowlists {
  @Column("bytea", { primary: true, name: "transfer_validator" })
  transferValidator: Buffer;

  @Column("integer", { primary: true, name: "id" })
  id: number;

  @Column("jsonb", { name: "allowlist" })
  allowlist: object;
}
