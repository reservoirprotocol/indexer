import { Column, Entity, Index } from "typeorm";

@Index("transactions_from_index", ["from"], {})
@Index("transactions_pk", ["hash"], { unique: true })
@Index("transactions_to_index", ["to"], {})
@Entity("transactions", { schema: "public" })
export class Transactions {
  @Column("bytea", { primary: true, name: "hash" })
  hash: Buffer;

  @Column("bytea", { name: "from" })
  from: Buffer;

  @Column("bytea", { name: "to" })
  to: Buffer;

  @Column("numeric", { name: "value" })
  value: string;

  @Column("bytea", { name: "data", nullable: true })
  data: Buffer | null;

  @Column("integer", { name: "block_number", nullable: true })
  blockNumber: number | null;

  @Column("integer", { name: "block_timestamp", nullable: true })
  blockTimestamp: number | null;

  @Column("numeric", { name: "gas_used", nullable: true })
  gasUsed: string | null;

  @Column("numeric", { name: "gas_price", nullable: true })
  gasPrice: string | null;

  @Column("numeric", { name: "gas_fee", nullable: true })
  gasFee: string | null;
}
