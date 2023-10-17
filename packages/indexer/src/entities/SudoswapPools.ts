import { Column, Entity, Index } from "typeorm";

@Index("sudoswap_pools_pk", ["address"], { unique: true })
@Entity("sudoswap_pools", { schema: "public" })
export class SudoswapPools {
  @Column("bytea", { primary: true, name: "address" })
  address: Buffer;

  @Column("bytea", { name: "nft" })
  nft: Buffer;

  @Column("bytea", { name: "token" })
  token: Buffer;

  @Column("bytea", { name: "bonding_curve" })
  bondingCurve: Buffer;

  @Column("smallint", { name: "pool_kind" })
  poolKind: number;

  @Column("smallint", { name: "pair_kind" })
  pairKind: number;
}
