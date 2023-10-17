import { Column, Entity, Index } from "typeorm";

@Index("nftx_nft_pools_pk", ["address"], { unique: true })
@Entity("nftx_nft_pools", { schema: "public" })
export class NftxNftPools {
  @Column("bytea", { primary: true, name: "address" })
  address: Buffer;

  @Column("bytea", { name: "nft" })
  nft: Buffer;

  @Column("integer", { name: "vault_id" })
  vaultId: number;
}
