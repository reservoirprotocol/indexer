import { Column, Entity, Index } from "typeorm";

@Index("currencies_pk", ["contract"], { unique: true })
@Entity("currencies", { schema: "public" })
export class Currencies {
  @Column("bytea", { primary: true, name: "contract" })
  contract: Buffer;

  @Column("text", { name: "name", nullable: true })
  name: string | null;

  @Column("text", { name: "symbol", nullable: true })
  symbol: string | null;

  @Column("smallint", { name: "decimals", nullable: true })
  decimals: number | null;

  @Column("jsonb", { name: "metadata", nullable: true })
  metadata: object | null;
}
