import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("execution_results_pk", ["id"], { unique: true })
@Entity("execution_results", { schema: "public" })
export class ExecutionResults {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: string;

  @Column("uuid", { name: "request_id" })
  requestId: string;

  @Column("text", { name: "step_id" })
  stepId: string;

  @Column("text", { name: "api_key", nullable: true })
  apiKey: string | null;

  @Column("bytea", { name: "tx_hash", nullable: true })
  txHash: Buffer | null;

  @Column("text", { name: "error_message", nullable: true })
  errorMessage: string | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;
}
