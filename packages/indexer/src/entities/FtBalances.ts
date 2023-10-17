import { Column, Entity, Index } from "typeorm";

@Index("ft_balances_pk", ["contract", "owner"], { unique: true })
@Entity("ft_balances", { schema: "public" })
export class FtBalances {
  @Column("bytea", { primary: true, name: "contract" })
  contract: Buffer;

  @Column("bytea", { primary: true, name: "owner" })
  owner: Buffer;

  @Column("numeric", { name: "amount", precision: 78, scale: 0 })
  amount: string;
}
