import { Column, Entity, Index } from "typeorm";

@Index("midaswap_pools_pk", ["address"], { unique: true })
@Entity("midaswap_pools")
export class MidaswapPools {
  @Column("bytea", { primary: true, name: "address" })
  address: Buffer;

  @Column("bytea", { name: "nft" })
  nft: Buffer;

  @Column("bytea", { name: "token" })
  token: Buffer;

  @Column("numeric", { name: "free_rate_bps", precision: 78, scale: 0 })
  freeRateBps: string;

  @Column("numeric", { name: "royalty_bps", precision: 78, scale: 0 })
  royaltyBps: string;
}
