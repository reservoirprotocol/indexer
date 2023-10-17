import { Column, Entity, Index } from "typeorm";

@Index("transaction_logs_pk", ["hash"], { unique: true })
@Entity("transaction_logs", { schema: "public" })
export class TransactionLogs {
  @Column("bytea", { primary: true, name: "hash" })
  hash: Buffer;

  @Column("jsonb", { name: "logs" })
  logs: object;
}
