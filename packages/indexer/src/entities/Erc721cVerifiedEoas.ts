import { Column, Entity, Index } from "typeorm";

@Index("erc721c_verified_eoas_pk", ["address", "transferValidator"], {
  unique: true,
})
@Entity("erc721c_verified_eoas", { schema: "public" })
export class Erc721cVerifiedEoas {
  @Column("bytea", { primary: true, name: "transfer_validator" })
  transferValidator: Buffer;

  @Column("bytea", { primary: true, name: "address" })
  address: Buffer;
}
