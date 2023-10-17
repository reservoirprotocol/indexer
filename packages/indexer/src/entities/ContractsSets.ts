import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("contracts_sets_collections_hash_unique_index", ["contractsHash"], {
  unique: true,
})
@Index("contracts_sets_pk", ["id"], { unique: true })
@Entity("contracts_sets", { schema: "public" })
export class ContractsSets {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: string;

  @Column("text", { name: "contracts_hash" })
  contractsHash: string;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;
}
