import { Column, Entity, Index } from "typeorm";

@Index("nftx_ft_pools_pk", ["address"], { unique: true })
@Entity("nftx_ft_pools")
export class NftxFtPools {
  @Column("bytea", { primary: true, name: "address" })
  address: Buffer;

  @Column("bytea", { name: "token0" })
  token0: Buffer;

  @Column("bytea", { name: "token1" })
  token1: Buffer;

  @Column("enum", {
    name: "pool_kind",
    nullable: true,
    enum: ["sushiswap", "uniswap-v3"],
    default: () => "'sushiswap'",
  })
  poolKind: "sushiswap" | "uniswap-v3" | null;
}
