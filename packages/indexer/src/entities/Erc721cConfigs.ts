import { Column, Entity, Index } from "typeorm";

@Index("erc721c_configs_pk", ["contract"], { unique: true })
@Index("erc721c_configs_transfer_validator_index", ["transferValidator"], {})
@Entity("erc721c_configs", { schema: "public" })
export class Erc721cConfigs {
  @Column("bytea", { primary: true, name: "contract" })
  contract: Buffer;

  @Column("bytea", { name: "transfer_validator" })
  transferValidator: Buffer;

  @Column("smallint", { name: "transfer_security_level" })
  transferSecurityLevel: number;

  @Column("integer", { name: "operator_whitelist_id" })
  operatorWhitelistId: number;

  @Column("integer", { name: "permitted_contract_receiver_allowlist_id" })
  permittedContractReceiverAllowlistId: number;

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
