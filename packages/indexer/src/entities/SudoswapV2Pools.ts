import { Column, Entity, Index } from "typeorm";

@Index("sudoswap_v2_pools_pk", ["address"], { unique: true })
@Entity("sudoswap_v2_pools", { schema: "public" })
export class SudoswapV2Pools {
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

  @Column("bytea", { name: "property_checker" })
  propertyChecker: Buffer;

  @Column("numeric", {
    name: "token_id",
    nullable: true,
    precision: 78,
    scale: 0,
    default: () => "NULL::numeric",
  })
  tokenId: string | null;
}
