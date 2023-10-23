import { Column, Entity, Index } from "typeorm";

@Index("collectionxyz_pools_pk", ["address"], { unique: true })
@Entity("collectionxyz_pools")
export class CollectionxyzPools {
  @Column("bytea", { primary: true, name: "address" })
  address: Buffer;

  @Column("bytea", { name: "nft" })
  nft: Buffer;

  @Column("bytea", { name: "token" })
  token: Buffer;

  @Column("bytea", { name: "bonding_curve" })
  bondingCurve: Buffer;

  @Column("smallint", { name: "pool_variant" })
  poolVariant: number;

  @Column("smallint", { name: "pool_type" })
  poolType: number;
}
