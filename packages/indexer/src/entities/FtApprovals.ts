import { Column, Entity, Index } from "typeorm";

@Index("ft_approvals_pk", ["owner", "spender", "token"], { unique: true })
@Entity("ft_approvals", { schema: "public" })
export class FtApprovals {
  @Column("bytea", { primary: true, name: "token" })
  token: Buffer;

  @Column("bytea", { primary: true, name: "owner" })
  owner: Buffer;

  @Column("bytea", { primary: true, name: "spender" })
  spender: Buffer;

  @Column("numeric", { name: "value" })
  value: string;
}
