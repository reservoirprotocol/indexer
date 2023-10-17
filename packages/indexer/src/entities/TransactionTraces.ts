import { Column, Entity, Index } from "typeorm";

@Index("transaction_traces_pk", ["hash"], { unique: true })
@Entity("transaction_traces", { schema: "public" })
export class TransactionTraces {
  @Column("bytea", { primary: true, name: "hash" })
  hash: Buffer;

  @Column("jsonb", { name: "calls" })
  calls: object;
}
