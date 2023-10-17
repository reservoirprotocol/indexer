import { Column, Entity, Index } from "typeorm";

@Index("contracts_pk", ["address"], { unique: true })
@Entity("contracts", { schema: "public" })
export class Contracts {
  @Column("bytea", { primary: true, name: "address" })
  address: Buffer;

  @Column("enum", {
    name: "kind",
    enum: ["erc721", "erc1155", "cryptopunks", "erc721-like"],
  })
  kind: "erc721" | "erc1155" | "cryptopunks" | "erc721-like";

  @Column("jsonb", { name: "filtered_operators", nullable: true })
  filteredOperators: object | null;

  @Column("text", { name: "symbol", nullable: true })
  symbol: string | null;

  @Column("text", { name: "name", nullable: true })
  name: string | null;

  @Column("timestamp with time zone", { name: "deployed_at", nullable: true })
  deployedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;
}
