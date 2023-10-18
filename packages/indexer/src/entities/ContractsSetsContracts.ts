import { Column, Entity, Index } from "typeorm";

@Index("contracts_sets_contracts_pk", ["contract", "contractsSetId"], {
  unique: true,
})
@Entity("contracts_sets_contracts")
export class ContractsSetsContracts {
  @Column("text", { primary: true, name: "contracts_set_id" })
  contractsSetId: string;

  @Column("bytea", { primary: true, name: "contract" })
  contract: Buffer;
}
